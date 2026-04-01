import { useState } from 'react';
import type { Memory } from '../types';
import { searchMemories } from '../api';
import MemoryCard from '../components/MemoryCard';
import DetailPanel from '../components/DetailPanel';
import { deleteMemory } from '../api';

export default function Search() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Memory[]>([]);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<Memory | null>(null);

  const doSearch = async () => {
    if (!query.trim()) return;
    const res = await searchMemories(query.trim());
    setResults(Array.isArray(res) ? res : res.items || []);
    setSearched(true);
    setSelected(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') doSearch();
  };

  const handleDelete = async (id: number) => {
    await deleteMemory(id);
    setSelected(null);
    setResults((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <div className="split-layout">
      <div className="split-main">
        <div className="controls">
          <input
            type="text"
            placeholder="Search memories..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="search-input"
          />
          <button onClick={doSearch} className="btn-primary">Search</button>
        </div>
        <div className="card-grid">
          {searched && results.length === 0 && (
            <div className="empty-state">No results found</div>
          )}
          {results.map((m) => (
            <MemoryCard
              key={m.id}
              memory={m}
              selected={selected?.id === m.id}
              showSimilarity
              onClick={() => setSelected(m)}
            />
          ))}
        </div>
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
