'use client';

import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState, useTransition } from 'react';
import { useToast } from '@/components/admin/ToastProvider';
import {
  createPhaseTemplate,
  updatePhaseTemplate,
  type PhaseMilestoneInput,
  type PhaseTemplateInput,
  type ProjectTemplateType,
} from './actions';
import {
  BuilderProvider,
  type BuilderContextValue,
} from './builder-context';
import {
  newPhase,
  type BuilderMilestone,
  type BuilderPhase,
  type PhaseNode as PhaseNodeT,
} from './builder-types';
import { BuilderToolbar } from './components/BuilderToolbar';
import { TemplatePreview } from './components/TemplatePreview';
import { PhaseNode } from './nodes/PhaseNode';
import type { TemplateDetail } from './queries';

const NODE_X = 250;
const NODE_Y_STEP = 320;

const EDGE_STYLE = {
  stroke: '#A8D0D6',
  strokeWidth: 2,
};

const EDGE_MARKER = { type: MarkerType.ArrowClosed, color: '#A8D0D6' };

interface Props {
  template: TemplateDetail | null;
}

/**
 * Infinite-canvas template builder. Internally tracks three pieces of state:
 *
 * - React Flow nodes: drive the visual layout + selection + drag state.
 *   Each node's `data` is a `PhaseNodeData` — the phase fields plus a
 *   transient `phaseNumber` badge.
 * - React Flow edges: dependency arrows (source → target).
 * - `expandedIds` (per-phase accordion state) and `name` / `type` at the
 *   template level.
 *
 * All phase-edit callbacks (`updatePhase`, `addMilestone`, …) go through
 * `BuilderProvider` context so node `data` stays referentially stable —
 * otherwise every keystroke in an input would re-render every node and
 * blow away input focus.
 */
export function TemplateBuilder({ template }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isSaving, startTransition] = useTransition();
  const [previewOpen, setPreviewOpen] = useState(false);

  const initial = useMemo(() => buildInitialState(template), [template]);
  const [name, setName] = useState(initial.name);
  const [type, setType] = useState<ProjectTemplateType>(initial.type);
  const [nodes, setNodes, onNodesChange] = useNodesState<PhaseNodeT>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(initial.nodes.length === 1 ? [initial.nodes[0].id] : []),
  );

  // The toolbar + preview read the current phase objects straight off the
  // node array — keeps a single source of truth and avoids a parallel
  // `phases` state we'd have to keep in sync.
  const phases = useMemo(() => nodes.map((n) => n.data), [nodes]);

  // ---- context callbacks ----

  const updatePhase = useCallback(
    (phaseId: string, patch: Partial<BuilderPhase>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === phaseId ? { ...n, data: { ...n.data, ...patch } } : n,
        ),
      );
    },
    [setNodes],
  );

  const deletePhase = useCallback(
    (phaseId: string) => {
      setNodes((nds) => renumber(nds.filter((n) => n.id !== phaseId)));
      setEdges((eds) =>
        eds.filter((e) => e.source !== phaseId && e.target !== phaseId),
      );
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.delete(phaseId);
        return next;
      });
    },
    [setNodes, setEdges],
  );

  const addMilestone = useCallback(
    (phaseId: string, milestone: BuilderMilestone) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === phaseId
            ? { ...n, data: { ...n.data, milestones: [...n.data.milestones, milestone] } }
            : n,
        ),
      );
    },
    [setNodes],
  );

  const updateMilestone = useCallback(
    (phaseId: string, milestoneId: string, patch: Partial<BuilderMilestone>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === phaseId
            ? {
                ...n,
                data: {
                  ...n.data,
                  milestones: n.data.milestones.map((m) =>
                    m.id === milestoneId ? { ...m, ...patch } : m,
                  ),
                },
              }
            : n,
        ),
      );
    },
    [setNodes],
  );

  const deleteMilestone = useCallback(
    (phaseId: string, milestoneId: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === phaseId
            ? {
                ...n,
                data: {
                  ...n.data,
                  milestones: n.data.milestones.filter((m) => m.id !== milestoneId),
                },
              }
            : n,
        ),
      );
    },
    [setNodes],
  );

  const toggleExpanded = useCallback((phaseId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
      return next;
    });
  }, []);

  const isExpanded = useCallback((phaseId: string) => expandedIds.has(phaseId), [expandedIds]);

  const ctx: BuilderContextValue = useMemo(
    () => ({
      updatePhase,
      deletePhase,
      addMilestone,
      updateMilestone,
      deleteMilestone,
      toggleExpanded,
      isExpanded,
    }),
    [updatePhase, deletePhase, addMilestone, updateMilestone, deleteMilestone, toggleExpanded, isExpanded],
  );

  // ---- canvas actions ----

  const nodeTypes = useMemo<NodeTypes>(() => ({ phase: PhaseNode }), []);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target) return;
      setEdges((eds) => {
        // Dedupe: don't add the same edge twice.
        if (
          eds.some(
            (e) => e.source === connection.source && e.target === connection.target,
          )
        ) {
          return eds;
        }
        return addEdge(
          {
            ...connection,
            type: 'smoothstep',
            animated: true,
            style: EDGE_STYLE,
            markerEnd: EDGE_MARKER,
          },
          eds,
        );
      });
    },
    [setEdges],
  );

  function handleAddPhase() {
    const newPhaseData = newPhase();
    const newId = newPhaseData.id;
    const lastNode = nodes[nodes.length - 1];
    const newY = lastNode ? lastNode.position.y + NODE_Y_STEP : 0;
    const newNumber = nodes.length + 1;

    setNodes((nds) => [
      ...nds,
      {
        id: newId,
        type: 'phase',
        position: { x: NODE_X, y: newY },
        data: { ...newPhaseData, phaseNumber: newNumber },
      },
    ]);

    if (lastNode) {
      setEdges((eds) => [
        ...eds,
        {
          id: `${lastNode.id}-${newId}`,
          source: lastNode.id,
          target: newId,
          type: 'smoothstep',
          animated: true,
          style: EDGE_STYLE,
          markerEnd: EDGE_MARKER,
        },
      ]);
    }

    // Auto-expand the new phase so the user lands directly in its editor.
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.add(newId);
      return next;
    });
  }

  // ---- save ----

  function handleSave() {
    if (!name.trim()) {
      showToast('Template name is required.', 'error');
      return;
    }
    if (phases.length === 0) {
      showToast('Add at least one phase.', 'error');
      return;
    }

    const input = toInput(name, type, nodes, edges);

    startTransition(async () => {
      const result = template?.id
        ? await updatePhaseTemplate(template.id, input)
        : await createPhaseTemplate(input);

      if (!result.success) {
        showToast(result.error, 'error');
        return;
      }
      showToast(template?.id ? 'Template saved' : 'Template created');
      router.push('/admin/templates');
    });
  }

  function handleCancel() {
    router.push('/admin/templates');
  }

  return (
    <BuilderProvider value={ctx}>
      <div className="fixed inset-0 top-0 left-0 h-screen w-screen bg-[#F9F9F7]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.3}
          maxZoom={1.5}
          defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
          connectionLineStyle={EDGE_STYLE}
          snapToGrid
          snapGrid={[20, 20]}
          deleteKeyCode={null}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#E8E6E1" />
          <Controls position="bottom-right" showInteractive={false} />
          <MiniMap
            position="bottom-left"
            nodeColor="#1B4F5A"
            maskColor="rgba(249, 249, 247, 0.8)"
            style={{ borderRadius: 12, border: '0.5px solid #E8E6E1' }}
          />
          <Panel position="top-left">
            <BuilderToolbar
              name={name}
              onNameChange={setName}
              type={type}
              onTypeChange={setType}
              phases={phases}
              isSaving={isSaving}
              onSave={handleSave}
              onPreview={() => setPreviewOpen(true)}
              onCancel={handleCancel}
            />
          </Panel>
          <Panel position="top-right">
            <button
              type="button"
              onClick={handleAddPhase}
              className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-all"
            >
              <Plus size={14} strokeWidth={2} />
              Add phase
            </button>
          </Panel>
        </ReactFlow>

        {previewOpen && (
          <TemplatePreview
            name={name}
            phases={phases}
            onClose={() => setPreviewOpen(false)}
          />
        )}
      </div>
    </BuilderProvider>
  );
}

// ---------- initial state construction ----------

interface InitialState {
  name: string;
  type: ProjectTemplateType;
  nodes: PhaseNodeT[];
  edges: Edge[];
}

function buildInitialState(template: TemplateDetail | null): InitialState {
  if (!template) {
    const blank = newPhase({ title: 'Phase 1' });
    return {
      name: '',
      type: 'remodel',
      nodes: [
        {
          id: blank.id,
          type: 'phase',
          position: { x: NODE_X, y: 0 },
          data: { ...blank, phaseNumber: 1 },
        },
      ],
      edges: [],
    };
  }

  // Flat legacy template: wrap all milestones into a single default phase so
  // David can migrate to phases by adding more and hitting save. The save
  // path always promotes the template to `usesPhases = true`.
  if (template.phases === null) {
    const wrapped = newPhase({
      title: template.name,
      milestones: template.milestones.map((m) => ({
        id: m.id,
        title: m.title,
        category: m.category ?? '',
        description: '',
        isDecisionPoint: false,
        decisionQuestion: '',
        decisionType: '' as const,
        decisionOptions: [],
      })),
    });
    return {
      name: template.name,
      type: template.type,
      nodes: [
        {
          id: wrapped.id,
          type: 'phase',
          position: { x: NODE_X, y: 0 },
          data: { ...wrapped, phaseNumber: 1 },
        },
      ],
      edges: [],
    };
  }

  // Phase-based template: lay out top-to-bottom in the order the server
  // returned. Dependencies become edges.
  const builderPhases: BuilderPhase[] = template.phases.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description ?? '',
    estimatedDuration: p.estimatedDuration ?? '',
    estimatedDays: p.estimatedDays,
    photoDocumentation: (p.photoDocumentation ?? 'before_during_after') as BuilderPhase['photoDocumentation'],
    milestones: p.milestones.map((m) => ({
      id: m.id,
      title: m.title,
      category: m.category ?? '',
      description: m.description ?? '',
      isDecisionPoint: m.isDecisionPoint,
      decisionQuestion: m.decisionQuestion ?? '',
      decisionType: (m.decisionType ?? '') as BuilderMilestone['decisionType'],
      decisionOptions: Array.isArray(m.decisionOptions)
        ? (m.decisionOptions as string[])
        : [],
    })),
  }));

  const nodes: PhaseNodeT[] = builderPhases.map((phase, i) => ({
    id: phase.id,
    type: 'phase',
    position: { x: NODE_X, y: i * NODE_Y_STEP },
    data: { ...phase, phaseNumber: i + 1 },
  }));

  const edges: Edge[] = [];
  for (const p of template.phases) {
    for (const depId of p.dependsOn) {
      edges.push({
        id: `${depId}-${p.id}`,
        source: depId,
        target: p.id,
        type: 'smoothstep',
        animated: true,
        style: EDGE_STYLE,
        markerEnd: EDGE_MARKER,
      });
    }
  }

  return {
    name: template.name,
    type: template.type,
    nodes,
    edges,
  };
}

/**
 * Keep `phaseNumber` in sync with the array order after a delete. The
 * number is cosmetic — the teal "1/2/3" badge on each card — so we just
 * rewrite it each time we re-render. Order is also re-derived at save
 * time from the final array.
 */
function renumber(nds: PhaseNodeT[]): PhaseNodeT[] {
  return nds.map((n, i) => ({
    ...n,
    data: { ...n.data, phaseNumber: i + 1 },
  }));
}

/**
 * Convert nodes + edges → `PhaseTemplateInput`. Phase order is the node
 * array order; dependencies become indexed references so the server can
 * resolve them to UUIDs after the phases are inserted.
 */
function toInput(
  name: string,
  type: ProjectTemplateType,
  nodes: PhaseNodeT[],
  edges: Edge[],
): PhaseTemplateInput {
  const indexById = new Map<string, number>();
  nodes.forEach((n, i) => indexById.set(n.id, i));

  return {
    name,
    type,
    phases: nodes.map((n, i) => {
      const phase = n.data;
      const deps = edges
        .filter((e) => e.target === n.id)
        .map((e) => indexById.get(e.source))
        .filter((idx): idx is number => idx !== undefined);

      const milestones: PhaseMilestoneInput[] = phase.milestones
        .filter((m) => (m.isDecisionPoint ? m.decisionQuestion.trim() : m.title.trim()))
        .map((m, j) => ({
          title: m.isDecisionPoint ? m.decisionQuestion : m.title,
          category: m.category || 'General',
          order: j + 1,
          description: m.description || null,
          isDecisionPoint: m.isDecisionPoint,
          decisionQuestion: m.isDecisionPoint ? m.decisionQuestion : null,
          decisionType: m.isDecisionPoint && m.decisionType ? m.decisionType : null,
          decisionOptions:
            m.isDecisionPoint && m.decisionOptions.length > 0 ? m.decisionOptions : null,
        }));

      return {
        title: phase.title,
        description: phase.description || null,
        order: i + 1,
        estimatedDuration: phase.estimatedDuration || null,
        estimatedDays: phase.estimatedDays,
        photoDocumentation: phase.photoDocumentation,
        dependsOnPhaseIndices: deps,
        milestones,
      };
    }),
  };
}
