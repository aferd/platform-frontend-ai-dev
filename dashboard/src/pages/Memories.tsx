import { useEffect, useState, useCallback } from 'react';
import type { Memory } from '../types';
import { fetchMemories, deleteMemory, fetchStats, fetchTags } from '../api';
import MemoryCard from '../components/MemoryCard';
import DetailPanel from '../components/DetailPanel';
import Pagination from '../components/Pagination';

const CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
  { value: 'learning', label: 'Learning' },
  { value: 'review_feedback', label: 'Review Feedback' },
  { value: 'codebase_pattern', label: 'Codebase Pattern' },
];

const LIMIT = 20;

export default function Memories() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [total, setTotal] = useState(0);
  const [category, setCategory] = useState('');
  const [repo, setRepo] = useState('');
  const [tag, setTag] = useState('');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Memory | null>(null);
  const [repos, setRepos] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);

  useEffect(() => {
    fetchStats().then((s: any) => {
      if (s.repos) setRepos(s.repos);
    }).catch(() => {});
    fetchTags().then((t: any) => {
      if (Array.isArray(t)) setTags(t);
      else if (t?.tags) setTags(t.tags);
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const res = await fetchMemories({
      category: category || undefined,
      repo: repo || undefined,
      tag: tag || undefined,
      limit: LIMIT,
      offset,
    });
    setMemories(res.items || []);
    setTotal(res.total || 0);
  }, [category, repo, tag, offset]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: number) => {
    await deleteMemory(id);
    setSelected(null);
    load();
  };

  return (
    <div className="split-layout">
      <div className="split-main">
        <div className="controls">
          <select value={category} onChange={(e) => { setCategory(e.target.value); setOffset(0); }}>
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select value={repo} onChange={(e) => { setRepo(e.target.value); setOffset(0); }}>
            <option value="">All Repos</option>
            {repos.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <select value={tag} onChange={(e) => { setTag(e.target.value); setOffset(0); }}>
            <option value="">All Tags</option>
            {tags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="card-grid">
          {memories.length === 0 && <div className="empty-state">No memories found</div>}
          {memories.map((m) => (
            <MemoryCard
              key={m.id}
              memory={m}
              selected={selected?.id === m.id}
              onClick={() => setSelected(m)}
            />
          ))}
        </div>
        <Pagination total={total} limit={LIMIT} offset={offset} onChange={setOffset} />
      </div>
      {selected && (
        <div className="split-detail">
          <DetailPanel
            type="memory"
            memory={selected}
            onClose={() => setSelected(null)}
            onDelete={handleDelete}
          />
        </div>
      )}
    </div>
  );
}
