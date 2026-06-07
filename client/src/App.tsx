import { lazy, Suspense, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Activity,
  Ban,
  BookOpen,
  Bot,
  Boxes,
  BrainCircuit,
  ChevronRight,
  CircleDollarSign,
  Crown,
  Crosshair,
  DatabaseZap,
  Gamepad2,
  Gauge,
  Hexagon,
  MousePointer2,
  Orbit,
  Radio,
  ShieldAlert,
  Sparkles,
  Swords,
  Target,
  Terminal,
  TrendingUp,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import { useProcedure, useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { procedures, reducers, tables } from './module_bindings';
import type {
  AgentIntent,
  OrderBook,
  TelemetryLog,
  WarCounsel,
} from './module_bindings/types';
import './App.css';

const HolographicTheater = lazy(() =>
  import('./components/HolographicTheater').then(module => ({ default: module.HolographicTheater }))
);

const FACTIONS = ['HELIX', 'NOVA', 'VOID'] as const;
const ASSETS = ['ENERGY', 'MATTER', 'DATA'] as const;
type Faction = (typeof FACTIONS)[number];
type Asset = (typeof ASSETS)[number];
type View = 'theater' | 'exchange' | 'council' | 'manual';

const factionLabel: Record<Faction, string> = {
  HELIX: 'Helix Directorate',
  NOVA: 'Nova Compact',
  VOID: 'Void Assembly',
};

const GRID_WIDTH = 12;

function formatBigInt(value: bigint | undefined): string {
  if (value === undefined) return '0';
  return new Intl.NumberFormat('en-US', { notation: 'compact' }).format(Number(value));
}

// Sector labels are column.row (x.y), matching the AI objective text and the theater dock.
function sectorLabel(nodeId: number): string {
  return `${(nodeId % GRID_WIDTH) + 1}.${Math.floor(nodeId / GRID_WIDTH) + 1}`;
}

function JoinPanel({ onJoined }: { onJoined: (ms: number) => void }) {
  const joinArena = useReducer(reducers.joinArena);
  const [name, setName] = useState('VANGUARD');
  const [faction, setFaction] = useState<Faction>('HELIX');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    const started = performance.now();
    try {
      await joinArena({ name, faction });
      onJoined(performance.now() - started);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Join failed');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="join-shell">
      <div className="join-visual" aria-hidden="true">
        <div className="join-world-label">
          <span>ONE SHARED WORLD</span>
          <strong>96 LIVE SECTORS · 18 AUTONOMOUS AGENTS</strong>
        </div>
      </div>
      <form className="join-panel" onSubmit={submit}>
        <div className="brand-lockup">
          <span className="brand-mark"><Hexagon size={24} /></span>
          <div><span>PROJECT</span><strong>HYPERION</strong></div>
        </div>
        <div className="join-copy">
          <span className="eyebrow">LIVING BENCHMARK ARENA</span>
          <h1>Command a world that never stops.</h1>
          <p>Capture territory, manipulate a live market, and outthink autonomous factions. Every action commits atomically inside SpacetimeDB.</p>
        </div>
        <label className="field-label" htmlFor="callsign">CALLSIGN</label>
        <input id="callsign" className="text-input" value={name} maxLength={18} onChange={event => setName(event.target.value.toUpperCase())} />
        <span className="field-label">FACTION</span>
        <div className="faction-select">
          {FACTIONS.map(option => (
            <button
              type="button"
              key={option}
              className={`faction-option faction-${option.toLowerCase()} ${faction === option ? 'selected' : ''}`}
              onClick={() => setFaction(option)}
            >
              <span className="faction-sigil" />
              <strong>{option}</strong>
              <small>{factionLabel[option]}</small>
            </button>
          ))}
        </div>
        {error && <div className="form-error">{error}</div>}
        <button className="primary-command" disabled={pending || name.trim().length < 2}>
          {pending ? 'SYNCHRONIZING' : 'ENTER 3D ARENA'} <ChevronRight size={18} />
        </button>
        <div className="join-foot"><Radio size={13} /> Direct real-time database link</div>
      </form>
    </div>
  );
}

function MarketPanel({ orders, onLatency }: { orders: readonly OrderBook[]; onLatency: (ms: number) => void }) {
  const placeOrder = useReducer(reducers.placeOrder);
  const cancelOrder = useReducer(reducers.cancelOrder);
  const { identity } = useSpacetimeDB();
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [asset, setAsset] = useState<Asset>('ENERGY');
  const [price, setPrice] = useState(42);
  const [volume, setVolume] = useState(10);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const filtered = [...orders]
    .filter(order => order.asset === asset)
    .sort((a, b) => a.side === b.side ? (a.side === 'BUY' ? b.price - a.price : a.price - b.price) : a.side.localeCompare(b.side))
    .slice(0, 10);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    const started = performance.now();
    try {
      await placeOrder({ side, asset, price, volume });
      onLatency(performance.now() - started);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Order rejected');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="surface market-panel">
      <div className="section-heading">
        <div><span>ATOMIC EXCHANGE</span><h2><CircleDollarSign size={18} /> Commodity market</h2></div>
        <span className="live-chip"><i /> LIVE</span>
      </div>
      <div className="asset-tabs">
        {ASSETS.map(value => <button key={value} className={asset === value ? 'active' : ''} onClick={() => setAsset(value)}>{value}</button>)}
      </div>
      <form className="order-ticket" onSubmit={submit}>
        <div className="side-control">
          <button type="button" className={side === 'BUY' ? 'buy active' : 'buy'} onClick={() => setSide('BUY')}>BUY</button>
          <button type="button" className={side === 'SELL' ? 'sell active' : 'sell'} onClick={() => setSide('SELL')}>SELL</button>
        </div>
        <label><span>LIMIT PRICE</span><input aria-label="Limit price" type="number" min={1} max={10000} value={price} onChange={event => setPrice(Number(event.target.value))} /></label>
        <label><span>VOLUME</span><input aria-label="Volume" type="number" min={1} max={5000} value={volume} onChange={event => setVolume(Number(event.target.value))} /></label>
        <button className={`execute-order ${side.toLowerCase()}`} disabled={pending}>{pending ? 'COMMITTING' : `${side} ${asset}`}</button>
      </form>
      {error && <div className="inline-error">{error}</div>}
      <div className="order-table">
        <div className="table-head"><span>SIDE</span><span>PRICE</span><span>VOL</span><span>CALLSIGN</span><span /></div>
        {filtered.length === 0 && <div className="empty-row">No resting orders. Create the market signal.</div>}
        {filtered.map(order => (
          <div className="table-row" key={order.id.toString()}>
            <span className={order.side === 'BUY' ? 'text-buy' : 'text-sell'}>{order.side}</span>
            <strong>{order.price}</strong><span>{order.remaining}</span><span>{order.ownerName}</span>
            {identity && order.owner.equals(identity) ? (
              <button className="icon-button" title="Cancel order" onClick={async () => {
                const started = performance.now();
                await cancelOrder({ orderId: order.id });
                onLatency(performance.now() - started);
              }}><Ban size={13} /></button>
            ) : <span />}
          </div>
        ))}
      </div>
    </section>
  );
}

function BenchmarkPanel({ telemetry, observedLatency }: { telemetry: readonly TelemetryLog[]; observedLatency: number[] }) {
  const samples = [...telemetry].sort((a, b) => Number(b.sequence - a.sequence)).slice(0, 10);
  const avgRtt = observedLatency.length ? observedLatency.reduce((total, value) => total + value, 0) / observedLatency.length : 1.4;
  const avgShadow = samples.length ? samples.reduce((total, row) => total + row.shadowEstimatedMicros / 1000, 0) / samples.length : 70;
  const max = Math.max(avgRtt, avgShadow, 1);

  return (
    <section className="surface benchmark-panel">
      <div className="section-heading">
        <div><span>ARCHITECTURE RACE</span><h2><Gauge size={18} /> Commit telemetry</h2></div>
        <span className="model-chip">SHADOW MODELED</span>
      </div>
      <div className="race-bars">
        <div className="race-row">
          <div className="race-label"><DatabaseZap size={17} /><span>SPACETIMEDB</span><strong>{avgRtt.toFixed(1)} ms</strong></div>
          <div className="bar-track"><i className="bar-spacetime" style={{ width: `${Math.max(7, (avgRtt / max) * 100)}%` }} /></div>
          <small>Observed reducer commit RTT · one unified state transition</small>
        </div>
        <div className="race-row">
          <div className="race-label"><Boxes size={17} /><span>ENTERPRISE SHADOW</span><strong>{avgShadow.toFixed(1)} ms</strong></div>
          <div className="bar-track"><i className="bar-shadow" style={{ width: `${(avgShadow / max) * 100}%` }} /></div>
          <small>Gateway + API + cache + SQL structural model</small>
        </div>
      </div>
      <div className="trace-list">
        {samples.map(sample => (
          <div className="trace-row" key={sample.sequence.toString()}>
            <span>#{sample.sequence.toString().padStart(5, '0')}</span>
            <strong>{sample.operation.replaceAll('_', ' ')}</strong>
            <span>{sample.rowsTouched} rows</span><span>{sample.shadowHops} hops</span><i />
          </div>
        ))}
      </div>
    </section>
  );
}

function WarCouncilView({
  intents,
  counsel,
  onSelectTarget,
}: {
  intents: readonly AgentIntent[];
  counsel: readonly WarCounsel[];
  onSelectTarget: (nodeId: number) => void;
}) {
  // SpacetimeDB Procedure: reads the live snapshot, calls the LLM via ctx.http.fetch,
  // and commits the plan to the war_counsel table — all inside the database.
  const askWarCouncil = useProcedure(procedures.askWarCouncil);
  const [question, setQuestion] = useState('What is my highest-value next move?');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('');

  async function askCouncil(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const result = await askWarCouncil({ question });
      setMode(result.mode === 'openai' ? `OPENAI · ${result.model}` : 'IN-DATABASE PLANNER');
      onSelectTarget(result.targetNodeId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'War Council failed');
    } finally {
      setPending(false);
    }
  }

  const recentCounsel = [...counsel].sort((a, b) => Number(b.id - a.id)).slice(0, 6);
  const sortedIntents = [...intents].sort((a, b) => b.confidence - a.confidence);

  return (
    <div className="council-view">
      <section className="council-intro">
        <span className="eyebrow">SPACETIMEDB PROCEDURE · ctx.http → LLM</span>
        <h1>War Council</h1>
        <p>A SpacetimeDB procedure reads the live snapshot, calls the LLM over ctx.http.fetch, and commits a typed battle plan back into the database — no separate AI server.</p>
      </section>
      <div className="council-layout">
        <section className="surface strategist-console">
          <div className="section-heading">
            <div><span>STRATEGIC QUERY</span><h2><BrainCircuit size={18} /> Ask the council</h2></div>
            <span className="ai-chip"><Sparkles size={12} /> {mode || 'AGENT READY'}</span>
          </div>
          <form onSubmit={askCouncil}>
            <textarea aria-label="Question for War Council" value={question} onChange={event => setQuestion(event.target.value)} maxLength={500} />
            <button disabled={pending || question.trim().length < 4}>
              <BrainCircuit size={17} /> {pending ? 'SIMULATING FUTURES' : 'GENERATE BATTLE PLAN'}
            </button>
          </form>
          {error && <div className="inline-error">{error}. Without a key the in-database planner still runs; set one via <code>spacetime call hyperion-popxo configure_war_council</code>.</div>}
          <div className="counsel-history">
            {recentCounsel.length === 0 && <div className="empty-row">No strategy committed yet.</div>}
            {recentCounsel.map(item => (
              <article key={item.id.toString()}>
                <div><span>{item.model}</span><strong>{item.objective}</strong></div>
                <p>{item.rationale}</p>
                <footer><span>RISK · {item.risk}</span><button onClick={() => onSelectTarget(item.targetNodeId)}>TARGET {sectorLabel(item.targetNodeId)}</button></footer>
              </article>
            ))}
          </div>
        </section>
        <section className="surface agent-matrix">
          <div className="section-heading">
            <div><span>LIVE AUTONOMOUS INTENT</span><h2><Bot size={18} /> Agent matrix</h2></div>
            <span className="live-chip"><i /> {intents.length} ONLINE</span>
          </div>
          <div className="agent-grid">
            {sortedIntents.map(intent => (
              <article key={intent.botId} className={`agent-card faction-${intent.faction.toLowerCase()}`}>
                <header><span>{intent.callsign}</span><strong>{intent.confidence}%</strong></header>
                <h3>{intent.strategy}</h3>
                <p>{intent.objective}</p>
                <small>{intent.reasoning}</small>
                <button onClick={() => onSelectTarget(intent.targetNodeId)}><Target size={12} /> TRACK TARGET</button>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function HowToPlayView() {
  return (
    <div className="manual-view">
      <section className="manual-hero">
        <div>
          <span className="eyebrow">FIELD MANUAL · 4 MINUTE READ</span>
          <h1>Capture. Trade. Disrupt. Dominate.</h1>
          <p>Hyperion is economic warfare in one persistent shared world. Territory produces resources; resources power markets and attacks; every decision changes everyone’s state in real time.</p>
        </div>
        <div className="win-condition">
          <Trophy size={26} />
          <span>WIN CONDITION</span>
          <strong>Highest score when season clock ends</strong>
          <small>Score through extraction, sector control, trades, and tactical disruption.</small>
        </div>
      </section>

      <section className="loop-band">
        {[
          ['01', 'DEPLOY', 'Choose faction and enter one identity-backed unit.', Gamepad2],
          ['02', 'CAPTURE', 'Select an adjacent 3D sector. Power becomes capture pressure.', Crosshair],
          ['03', 'EXTRACT', 'Controlled sectors generate Energy, Matter, or Data each tick.', Zap],
          ['04', 'TRADE', 'Place escrowed orders. Matching executes atomically in memory.', TrendingUp],
          ['05', 'DISRUPT', 'Spend Data and Energy to blockade critical enemy sectors.', ShieldAlert],
        ].map(([number, title, copy, Icon]) => (
          <article key={String(number)}>
            <span>{String(number)}</span><Icon size={22} /><h2>{String(title)}</h2><p>{String(copy)}</p>
          </article>
        ))}
      </section>

      <section className="manual-sections">
        <article>
          <span className="chapter">THEATER CONTROLS</span>
          <h2>Read the battlefield in 3D</h2>
          <div className="control-list">
            <div><MousePointer2 size={20} /><strong>SELECT</strong><p>Click a sector to inspect yield, owner, defense, and pressure.</p></div>
            <div><Orbit size={20} /><strong>ORBIT</strong><p>Drag to rotate. Scroll or pinch to zoom. Right-drag to pan.</p></div>
            <div><Swords size={20} /><strong>ADVANCE</strong><p>Move one tile orthogonally. Repeat attacks build atomic pressure.</p></div>
          </div>
        </article>
        <article>
          <span className="chapter">RESOURCE ECONOMY</span>
          <h2>Three resources, three powers</h2>
          <div className="resource-rules">
            <div className="energy-rule"><Zap /><strong>ENERGY</strong><p>Movement, industrial output, and blockade deployment.</p></div>
            <div className="matter-rule"><Boxes /><strong>MATTER</strong><p>Territorial strength and future unit reinforcement.</p></div>
            <div className="data-rule"><Radio /><strong>DATA</strong><p>Sabotage, intelligence, and market manipulation.</p></div>
          </div>
        </article>
        <article>
          <span className="chapter">WHY SPACETIMEDB</span>
          <h2>The architecture is part of the game</h2>
          <div className="architecture-flow">
            <div><span>CLIENT</span><small>intent</small></div><ChevronRight />
            <div className="highlight"><span>REDUCER</span><small>WASM logic</small></div><ChevronRight />
            <div className="highlight"><span>DATABASE</span><small>atomic state</small></div><ChevronRight />
            <div><span>EVERY PLAYER</span><small>live subscription</small></div>
          </div>
          <p className="architecture-copy">No separate game server, cache invalidation layer, or API synchronization loop. The authoritative world and its logic share one transactional boundary.</p>
        </article>
      </section>
    </div>
  );
}

export default function App() {
  const connection = useSpacetimeDB();
  const [players] = useTable(tables.player);
  const [nodes, nodesReady] = useTable(tables.gridNode);
  const [units] = useTable(tables.unit);
  const [orders] = useTable(tables.orderBook);
  const [trades] = useTable(tables.trade);
  const [telemetry] = useTable(tables.telemetryLog);
  const [arena] = useTable(tables.arenaState);
  const [agentIntents] = useTable(tables.agentIntent);
  const [warCounsel] = useTable(tables.warCounsel);
  const moveUnit = useReducer(reducers.moveUnit);
  const deployBlockade = useReducer(reducers.deployBlockade);
  const [view, setView] = useState<View>('theater');
  const [latencies, setLatencies] = useState<number[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<number>();
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

  const me = players.find(row => connection.identity && row.identity.equals(connection.identity));
  const myUnit = units.find(row => row.owner && connection.identity && row.owner.equals(connection.identity));
  const selectedNode = nodes.find(row => row.id === selectedNodeId);
  const state = arena[0];
  const rankedPlayers = [...players].sort((a, b) => Number(b.score - a.score)).slice(0, 5);
  const recentTrades = [...trades].sort((a, b) => Number(b.sequence - a.sequence)).slice(0, 8);
  const factionCounts = useMemo(() => Object.fromEntries(FACTIONS.map(faction => [faction, nodes.filter(node => node.controller === faction).length])), [nodes]);

  function recordLatency(ms: number) {
    setLatencies(current => [...current.slice(-19), ms]);
  }

  async function executeAction(action: () => Promise<void>) {
    setBusy(true);
    setActionError('');
    const started = performance.now();
    try {
      await action();
      recordLatency(performance.now() - started);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Action rejected');
    } finally {
      setBusy(false);
    }
  }

  if (connection.connectionError) {
    return (
      <div className="offline-state">
        <Terminal size={34} /><span className="eyebrow">DATABASE LINK OFFLINE</span>
        <h1>Hyperion cannot reach SpacetimeDB.</h1>
        <code>npm run dev:database &amp;&amp; npm run publish:local</code>
        <p>{connection.connectionError.message}</p>
      </div>
    );
  }

  if (!connection.isActive || !nodesReady) {
    return <div className="boot-state"><div className="boot-symbol"><Hexagon size={52} /></div><strong>HYPERION</strong><span>RECONSTRUCTING LIVE 3D WORLD</span><i /></div>;
  }

  if (!me) return <JoinPanel onJoined={recordLatency} />;

  const selectedAgent = agentIntents.find(intent => intent.targetNodeId === selectedNodeId);
  const controlled = factionCounts[me.faction] ?? 0;
  const myTrades = trades.filter(trade => trade.buyer === me.name || trade.seller === me.name).length;
  const hasCounsel = warCounsel.some(item => connection.identity && item.commander.equals(connection.identity));
  const averageLatency = latencies.length
    ? latencies.reduce((total, latency) => total + latency, 0) / latencies.length
    : 0;
  const selectedDistance = selectedNode && myUnit
    ? Math.abs(selectedNode.x - myUnit.x) + Math.abs(selectedNode.y - myUnit.y)
    : undefined;
  const selectedStatus = !selectedNode
    ? 'NO TARGET'
    : selectedNode.controller === me.faction
      ? 'FRIENDLY'
      : selectedNode.controller === 'NEUTRAL'
        ? 'UNCLAIMED'
        : 'HOSTILE';
  const tacticalObjectives = [
    { label: 'CONQUEST', detail: 'Hold 12 domains', current: Math.min(controlled, 12), target: 12, Icon: Crosshair },
    { label: 'ROYAL TRADE', detail: 'Complete 3 market bargains', current: Math.min(myTrades, 3), target: 3, Icon: TrendingUp },
    { label: 'THE ORACLE', detail: 'Seek one war prophecy', current: hasCounsel ? 1 : 0, target: 1, Icon: BrainCircuit },
  ];

  return (
    <main className={`app-shell view-${view}`}>
      <header className="topbar">
        <div className="brand-lockup compact">
          <span className="brand-mark"><Hexagon size={20} /></span>
          <div><span>PROJECT</span><strong>HYPERION</strong></div>
        </div>
        <nav className="game-nav" aria-label="Game views">
          <button className={view === 'theater' ? 'active' : ''} onClick={() => setView('theater')}><Gamepad2 size={15} /> THE REALM</button>
          <button className={view === 'exchange' ? 'active' : ''} onClick={() => setView('exchange')}><TrendingUp size={15} /> ROYAL EXCHANGE</button>
          <button className={view === 'council' ? 'active' : ''} onClick={() => setView('council')}><BrainCircuit size={15} /> WAR COUNCIL</button>
          <button className={view === 'manual' ? 'active' : ''} onClick={() => setView('manual')}><BookOpen size={15} /> FIELD GUIDE</button>
        </nav>
        <div className="player-chip">
          <span className={`faction-bar faction-${me.faction.toLowerCase()}`} />
          <div><strong>{me.name}</strong><small>{me.faction}</small></div>
        </div>
      </header>

      <section className="resource-strip">
        <div><Zap size={15} /><span>EMBER</span><strong>{formatBigInt(me.energy)}</strong></div>
        <div><Boxes size={15} /><span>STONE</span><strong>{formatBigInt(me.matter)}</strong></div>
        <div><Radio size={15} /><span>LORE</span><strong>{formatBigInt(me.data)}</strong></div>
        <div><CircleDollarSign size={15} /><span>CROWNS</span><strong>{formatBigInt(me.credits)}</strong></div>
        <div className="live-world"><i /><span>TICK</span><strong>{state?.tick.toString() ?? '0'}</strong><span>{state?.activeBots ?? 0} AGENTS</span></div>
      </section>

      {view === 'theater' && (
        <section className="theater-view">
          <Suspense fallback={<div className="scene-loading"><Hexagon size={38} /><span>RECONSTRUCTING 3D WORLD</span></div>}>
            <HolographicTheater nodes={nodes} units={units} myUnit={myUnit} selectedNodeId={selectedNodeId} onSelectNode={node => setSelectedNodeId(node.id)} />
          </Suspense>
          <div className="hud-corners" aria-hidden="true"><i /><i /><i /><i /></div>
          <div className="theater-title">
            <span className="eyebrow">THE {state?.season ?? 'GENESIS'} CAMPAIGN</span>
            <h1>Hyperion Keep</h1>
            <div className="commander-rank"><Crown size={12} /> {me.faction} LORD · {me.name}</div>
          </div>
          <aside className="mission-stack">
            <header><Target size={14} /><span>ROYAL DECREES</span><strong>{tacticalObjectives.filter(item => item.current >= item.target).length}/3</strong></header>
            {tacticalObjectives.map(({ label, detail, current, target, Icon }) => (
              <div className={current >= target ? 'objective complete' : 'objective'} key={label}>
                <Icon size={13} />
                <div><strong>{label}</strong><span>{detail}</span></div>
                <b>{current}/{target}</b>
                <i><em style={{ width: `${Math.min(100, current / target * 100)}%` }} /></i>
              </div>
            ))}
          </aside>
          <div className="theater-stats">
            <div><span>REALM</span><strong>{controlled}/96</strong><small>{me.faction} domains</small></div>
            <div><span>GLORY</span><strong>{formatBigInt(me.score)}</strong><small>campaign renown</small></div>
            <div><span>SYNC</span><strong>{averageLatency ? `${averageLatency.toFixed(0)}ms` : 'LIVE'}</strong><small>{formatBigInt(state?.totalOperations)} operations</small></div>
          </div>
          <div className="faction-radar">
            <header><span>REALM INFLUENCE</span><strong>96 HOLDS</strong></header>
            {FACTIONS.map(faction => (
              <div key={faction}>
                <i className={`faction-${faction.toLowerCase()}`} />
                <span>{faction}</span>
                <em><b className={`faction-${faction.toLowerCase()}`} style={{ width: `${factionCounts[faction] / 96 * 100}%` }} /></em>
                <strong>{factionCounts[faction]}</strong>
              </div>
            ))}
          </div>
          {selectedAgent && (
            <aside className="agent-signal">
              <div className="signal-title"><Bot size={15} /><span>INTERCEPTED AGENT INTENT</span><i /></div>
              <strong>{selectedAgent.callsign} · {selectedAgent.confidence}%</strong>
              <p>{selectedAgent.objective}</p>
              <small>{selectedAgent.reasoning}</small>
            </aside>
          )}
          <div className="sector-dock">
            <div className="unit-status">
              <span className={`unit-avatar faction-${me.faction.toLowerCase()}`}><Crown size={18} /></span>
              <div><span>YOUR CHAMPION</span><strong>{myUnit?.callsign ?? me.name}</strong><small>MIGHT {myUnit?.power ?? 0}</small></div>
            </div>
            <div><span>TARGET HOLD</span><strong>{selectedNode ? `${selectedNode.x + 1}.${selectedNode.y + 1}` : '—'}</strong><small>{selectedDistance === 1 ? 'ADJACENT' : selectedDistance === 0 ? 'CURRENT POSITION' : selectedDistance ? `${selectedDistance} DOMAINS AWAY` : 'CHOOSE A HOLD'}</small></div>
            <div><span>TRIBUTE</span><strong>{selectedNode ? `${selectedNode.resource} +${selectedNode.yieldRate}` : '—'}</strong><small>EACH WORLD TURN</small></div>
            <div className={`target-status status-${selectedStatus.toLowerCase().replace(' ', '-')}`}><span>ALLEGIANCE</span><strong>{selectedStatus}</strong><small>{selectedNode?.controller ?? 'AWAITING DECREE'}</small></div>
            <div><span>WALL / SIEGE</span><strong>{selectedNode ? `${selectedNode.defense} / ${selectedNode.pressure}` : '—'}</strong><small>{selectedNode?.blockadeUntilMicros ? 'UNDER SIEGE' : 'ROAD OPEN'}</small></div>
            <button disabled={!selectedNode || !myUnit || busy} onClick={() => selectedNode && myUnit && executeAction(() => moveUnit({ unitId: myUnit.id, targetNodeId: selectedNode.id }))}><Swords size={16} /> MARCH / CLAIM</button>
            <button className="danger" disabled={!selectedNode || busy} onClick={() => selectedNode && executeAction(() => deployBlockade({ nodeId: selectedNode.id }))}><ShieldAlert size={16} /> LAY SIEGE</button>
          </div>
          {actionError && <div className="theater-error">{actionError}</div>}
        </section>
      )}

      {view === 'exchange' && (
        <div className="exchange-view">
          <section className="view-intro compact-intro">
            <div><span className="eyebrow">HIGH-FREQUENCY ECONOMIC WARFARE</span><h1>Atomic Exchange</h1><p>Every order, match, balance update, and market print clears inside one reducer transaction.</p></div>
            <div className="market-ticker">
              <div><span>ENERGY</span><strong>{state?.lastEnergyPrice ?? 0}</strong></div>
              <div><span>MATTER</span><strong>{state?.lastMatterPrice ?? 0}</strong></div>
              <div><span>DATA</span><strong>{state?.lastDataPrice ?? 0}</strong></div>
            </div>
          </section>
          <div className="exchange-layout">
            <MarketPanel orders={orders} onLatency={recordLatency} />
            <BenchmarkPanel telemetry={telemetry} observedLatency={latencies} />
            <section className="surface tape-panel">
              <div className="section-heading"><div><span>MARKET TAPE</span><h2><Activity size={18} /> Cleared trades</h2></div><span>{recentTrades.length} RECENT</span></div>
              {recentTrades.map(row => <div className="trade-row" key={row.id.toString()}><span>{row.asset.slice(0, 1)}</span><strong>{row.price}</strong><small>×{row.volume}</small><i>{row.buyer} → {row.seller}</i></div>)}
            </section>
            <section className="surface leaders-panel">
              <div className="section-heading"><div><span>WAR INDEX</span><h2><Trophy size={18} /> Commanders</h2></div></div>
              {rankedPlayers.map((row, index) => <div className="leader-row" key={row.identity.toHexString()}><span>{String(index + 1).padStart(2, '0')}</span><i className={`faction-${row.faction.toLowerCase()}`} /><strong>{row.name}</strong><b>{formatBigInt(row.score)}</b></div>)}
            </section>
          </div>
        </div>
      )}

      {view === 'council' && (
        <WarCouncilView
          intents={agentIntents}
          counsel={warCounsel}
          onSelectTarget={nodeId => { setSelectedNodeId(nodeId); setView('theater'); }}
        />
      )}

      {view === 'manual' && <HowToPlayView />}

      <footer className="global-footer">
        <span><DatabaseZap size={13} /> SPACETIMEDB 2.4.1 · WASM LOGIC · LIVE RELATIONAL STATE</span>
        <span><Users size={13} /> {players.filter(row => row.online).length} COMMANDERS · {units.length} UNITS · {agentIntents.length} AGENT INTENTS</span>
      </footer>
    </main>
  );
}
