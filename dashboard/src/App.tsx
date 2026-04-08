import { useEffect, useState, useCallback } from 'react';
import { HashRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { WSProvider, useWS } from './hooks/useWebSocket';
import type { BotStatus } from './types';
import { fetchStats, fetchBotStatus } from './api';
import BotBanner from './components/BotBanner';
import Toasts from './components/Toasts';
import Tasks from './pages/Tasks';
import Memories from './pages/Memories';
import Search from './pages/Search';
import Costs from './pages/Costs';
import EmbeddingMap from './pages/EmbeddingMap';
import ArchivedTasks from './pages/ArchivedTasks';

function AppInner() {
  const [stats, setStats] = useState<{ tasks: number; memories: number }>({ tasks: 0, memories: 0 });
  const [botStatus, setBotStatus] = useState<BotStatus>({
    state: 'unknown',
    message: 'Loading...',
    jira_key: null,
    repo: null,
    cycle_start: null,
    updated_at: new Date().toISOString(),
  });
  const { connected, onEvent } = useWS();

  const loadStats = useCallback(async () => {
    try {
      const s = await fetchStats();
      const taskTotal = s.tasks ? Object.values(s.tasks as Record<string, number>).reduce((a: number, b: number) => a + b, 0) : 0;
      setStats({ tasks: taskTotal, memories: s.memories?.total ?? 0 });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadStats();
    fetchBotStatus().then((s: BotStatus) => setBotStatus(s)).catch(() => {});
  }, [loadStats]);

  useEffect(() => {
    const unsub = onEvent((event) => {
      if (event.type === 'bot_status') {
        setBotStatus(event.data);
      }
      if (
        event.type === 'task_added' ||
        event.type === 'task_removed' ||
        event.type === 'task_archived' ||
        event.type === 'memory_stored' ||
        event.type === 'memory_deleted'
      ) {
        loadStats();
      }
    });
    return unsub;
  }, [onEvent, loadStats]);

  return (
    <div className="app">
      <header>
        <div className="header-left">
          <img src="/static/icon.png" alt="" className="header-icon" />
          <h1 className="header-title">Řehoř</h1>
        </div>
        <div className="header-right">
          <div className="stats-bar">
            <span className="stat">{stats.tasks} tasks</span>
            <span className="stat">{stats.memories} memories</span>
          </div>
          <span className={`ws-dot ${connected ? 'connected' : ''}`} title={connected ? 'Connected' : 'Disconnected'} />
        </div>
      </header>

      <BotBanner status={botStatus} />
      <Toasts />

      <nav className="tab-nav">
        <NavLink to="/tasks">Tasks</NavLink>
        <NavLink to="/archived">Archive</NavLink>
        <NavLink to="/memories">Memories</NavLink>
        <NavLink to="/search">Search</NavLink>
        <NavLink to="/costs">Costs</NavLink>
        <NavLink to="/viz">Viz</NavLink>
      </nav>

      <main>
        <Routes>
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/archived" element={<ArchivedTasks />} />
          <Route path="/memories" element={<Memories />} />
          <Route path="/search" element={<Search />} />
          <Route path="/costs" element={<Costs />} />
          <Route path="/viz" element={<EmbeddingMap />} />
          <Route path="/" element={<Navigate to="/tasks" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <WSProvider>
      <HashRouter>
        <AppInner />
      </HashRouter>
    </WSProvider>
  );
}
