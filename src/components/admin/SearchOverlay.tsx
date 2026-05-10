'use client';

import {
  Briefcase,
  CircleHelp,
  Loader2,
  MapPin,
  Search,
  UserCog,
  Users,
  Wrench,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/utils';
import { searchAdmin } from '@/lib/search/queries';
import { EMPTY_RESULTS, type SearchResults } from '@/lib/search/types';

const STORAGE_KEY = 'insight_recent_searches';
const MAX_RECENT = 5;
const DEBOUNCE_MS = 150;

interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
}

export function SearchOverlay({ open, onClose }: SearchOverlayProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [recent, setRecent] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const handleClose = useCallback(() => {
    setQuery('');
    setResults(EMPTY_RESULTS);
    setActiveIndex(-1);
    onClose();
  }, [onClose]);

  // Focus input when opening. State resets happen in the onClose
  // callback so we avoid setState-in-effect.
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Body scroll lock.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Flatten results into a single navigable list.
  const flatResults = useMemo(() => {
    const items: FlatResult[] = [];
    if (results.clients.length) {
      items.push({ type: 'header', label: 'Clients' });
      results.clients.forEach((r) => items.push({ type: 'client', data: r }));
    }
    if (results.properties.length) {
      items.push({ type: 'header', label: 'Properties' });
      results.properties.forEach((r) => items.push({ type: 'property', data: r }));
    }
    if (results.projects.length) {
      items.push({ type: 'header', label: 'Projects' });
      results.projects.forEach((r) => items.push({ type: 'project', data: r }));
    }
    if (results.maintenance_plans.length) {
      items.push({ type: 'header', label: 'Maintenance plans' });
      results.maintenance_plans.forEach((r) => items.push({ type: 'plan', data: r }));
    }
    if (results.decisions.length) {
      items.push({ type: 'header', label: 'Decisions' });
      results.decisions.forEach((r) => items.push({ type: 'decision', data: r }));
    }
    if (results.staff.length) {
      items.push({ type: 'header', label: 'Staff' });
      results.staff.forEach((r) => items.push({ type: 'staff', data: r }));
    }
    return items;
  }, [results]);

  const selectableItems = useMemo(
    () => flatResults.filter((i) => i.type !== 'header'),
    [flatResults],
  );

  function doSearch(q: string) {
    if (q.trim().length < 2) {
      setResults(EMPTY_RESULTS);
      setLoading(false);
      return;
    }
    setLoading(true);
    searchAdmin(q).then((r) => {
      setResults(r);
      setActiveIndex(-1);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }

  function handleInput(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), DEBOUNCE_MS);
  }

  function saveRecent(q: string) {
    const trimmed = q.trim();
    if (trimmed.length < 2) return;
    const updated = [trimmed, ...recent.filter((r) => r !== trimmed)].slice(0, MAX_RECENT);
    setRecent(updated);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch {}
  }

  function navigate(item: FlatResult) {
    if (item.type === 'header') return;
    saveRecent(query);
    const href = getHref(item);
    handleClose();
    router.push(href);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { handleClose(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, selectableItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < selectableItems.length) {
        navigate(selectableItems[activeIndex]);
      }
    }
  }

  if (!open) return null;

  const hasResults = flatResults.length > 0;
  const hasQuery = query.trim().length >= 2;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]" role="dialog" aria-modal="true" aria-label="Search">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-[640px] mx-4 overflow-hidden rounded-2xl bg-paper shadow-modal" onKeyDown={handleKeyDown}>
        {/* Input */}
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Search size={18} strokeWidth={1.5} className="text-ink-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            placeholder="Search clients, projects, maintenance, staff…"
            aria-label="Search"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink-900 placeholder:text-ink-400 outline-none"
          />
          {loading && <Loader2 size={16} className="text-ink-400 animate-spin flex-shrink-0" />}
          <kbd className="text-ink-400 border-line bg-cream hidden rounded border px-1.5 py-0.5 text-[10px] font-medium sm:inline-block">ESC</kbd>
        </div>

        {/* Results / empty state */}
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {!hasQuery && !hasResults && (
            <EmptyState recent={recent} onSelectRecent={(r) => { setQuery(r); doSearch(r); }} />
          )}
          {hasQuery && !hasResults && !loading && (
            <div className="px-4 py-8 text-center text-sm text-ink-500">
              No matches for &ldquo;{query.trim()}&rdquo;
            </div>
          )}
          {hasResults && (
            <ResultsList
              items={flatResults}
              activeIndex={activeIndex}
              query={query}
              onSelect={navigate}
              onHover={setActiveIndex}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result list
// ---------------------------------------------------------------------------

type FlatResult =
  | { type: 'header'; label: string }
  | { type: 'client'; data: SearchResults['clients'][number] }
  | { type: 'property'; data: SearchResults['properties'][number] }
  | { type: 'project'; data: SearchResults['projects'][number] }
  | { type: 'plan'; data: SearchResults['maintenance_plans'][number] }
  | { type: 'decision'; data: SearchResults['decisions'][number] }
  | { type: 'staff'; data: SearchResults['staff'][number] };

function getHref(item: FlatResult): string {
  switch (item.type) {
    case 'client': return `/admin/clients/${item.data.id}`;
    case 'property': return `/admin/clients/${item.data.clientId}`;
    case 'project': return `/admin/projects/${item.data.id}`;
    case 'plan': return `/admin/maintenance/${item.data.id}`;
    case 'decision': return `/admin/projects/${item.data.projectId}`;
    case 'staff': return '/admin/staff';
    default: return '/admin';
  }
}

function getIcon(type: FlatResult['type']) {
  switch (type) {
    case 'client': return <Users size={14} strokeWidth={1.5} />;
    case 'property': return <MapPin size={14} strokeWidth={1.5} />;
    case 'project': return <Briefcase size={14} strokeWidth={1.5} />;
    case 'plan': return <Wrench size={14} strokeWidth={1.5} />;
    case 'decision': return <CircleHelp size={14} strokeWidth={1.5} />;
    case 'staff': return <UserCog size={14} strokeWidth={1.5} />;
    default: return null;
  }
}

function getLines(item: FlatResult): { primary: string; secondary: string } {
  switch (item.type) {
    case 'client': return { primary: item.data.name, secondary: item.data.email ?? '' };
    case 'property': return { primary: item.data.name, secondary: `${item.data.clientName} · ${item.data.address}` };
    case 'project': return { primary: item.data.name, secondary: `${item.data.clientName} · ${item.data.propertyName}` };
    case 'plan': return { primary: item.data.name, secondary: `${item.data.clientName} · ${item.data.status}` };
    case 'decision': return { primary: item.data.title, secondary: `${item.data.clientName} · ${item.data.projectName}` };
    case 'staff': return { primary: item.data.name, secondary: `${item.data.role.replace('_', ' ')} · ${item.data.email}` };
    default: return { primary: '', secondary: '' };
  }
}

function ResultsList({
  items,
  activeIndex,
  query,
  onSelect,
  onHover,
}: {
  items: FlatResult[];
  activeIndex: number;
  query: string;
  onSelect: (item: FlatResult) => void;
  onHover: (index: number) => void;
}) {
  let selectableIdx = -1;

  return (
    <ul role="listbox">
      {items.map((item) => {
        if (item.type === 'header') {
          return (
            <li key={`h-${item.label}`} className="px-3 pt-3 pb-1 text-[10px] font-semibold tracking-[0.14em] text-ink-400 uppercase">
              {item.label}
            </li>
          );
        }

        selectableIdx++;
        const idx = selectableIdx;
        const isActive = idx === activeIndex;
        const { primary, secondary } = getLines(item);

        return (
          <li
            key={`${item.type}-${item.data.id}`}
            role="option"
            aria-selected={isActive}
            onClick={() => onSelect(item)}
            onMouseEnter={() => onHover(idx)}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
              isActive ? 'bg-brand-teal-50 text-brand-teal-500' : 'text-ink-700 hover:bg-cream',
            )}
          >
            <span className={cn('flex-shrink-0', isActive ? 'text-brand-teal-500' : 'text-ink-400')}>
              {getIcon(item.type)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                <Highlight text={primary} query={query} />
              </div>
              {secondary && (
                <div className="truncate text-xs text-ink-500">
                  <Highlight text={secondary} query={query} />
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Match highlighting
// ---------------------------------------------------------------------------

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim() || query.trim().length < 2) return <>{text}</>;
  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.trim().toLowerCase() ? (
          <span key={i} className="bg-brand-gold-50 text-brand-gold-700 rounded px-0.5 font-semibold">{part}</span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Empty state with recent searches
// ---------------------------------------------------------------------------

function EmptyState({
  recent,
  onSelectRecent,
}: {
  recent: string[];
  onSelectRecent: (query: string) => void;
}) {
  return (
    <div className="px-4 py-6 text-center">
      <p className="text-sm text-ink-500">Search clients, projects, maintenance, staff…</p>
      {recent.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-medium tracking-wider text-ink-400 uppercase">Recent</p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {recent.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onSelectRecent(r)}
                className="bg-cream hover:bg-brand-teal-50 hover:text-brand-teal-500 rounded-lg px-3 py-1.5 text-xs font-medium text-ink-700 transition-colors"
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
