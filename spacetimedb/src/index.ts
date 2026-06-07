import { ScheduleAt, TimeDuration } from 'spacetimedb';
import { schema, table, t, SenderError } from 'spacetimedb/server';

const WIDTH = 12;
const HEIGHT = 8;
const TELEMETRY_WINDOW = 180;
const FACTIONS = ['HELIX', 'NOVA', 'VOID'] as const;
const ASSETS = ['ENERGY', 'MATTER', 'DATA'] as const;

const player = table(
  { name: 'player', public: true },
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
    faction: t.string().index('btree'),
    credits: t.u64(),
    energy: t.u64(),
    matter: t.u64(),
    data: t.u64(),
    score: t.u64(),
    online: t.bool(),
    joinedAt: t.timestamp(),
  }
);

const gridNode = table(
  { name: 'grid_node', public: true },
  {
    id: t.u32().primaryKey(),
    x: t.u32(),
    y: t.u32(),
    resource: t.string().index('btree'),
    yieldRate: t.u32(),
    controller: t.string().index('btree'),
    controllingPlayer: t.option(t.identity()),
    defense: t.u32(),
    blockadeUntilMicros: t.u64(),
    pressure: t.u32(),
  }
);

const unit = table(
  {
    name: 'unit',
    public: true,
    indexes: [
      { accessor: 'by_owner', algorithm: 'btree', columns: ['owner'] },
      { accessor: 'by_faction', algorithm: 'btree', columns: ['faction'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.option(t.identity()),
    botId: t.u32(),
    callsign: t.string(),
    faction: t.string(),
    x: t.u32(),
    y: t.u32(),
    power: t.u32(),
    bot: t.bool(),
    lastActionTick: t.u64(),
  }
);

const botAgent = table(
  { name: 'bot_agent' },
  {
    id: t.u32().primaryKey(),
    name: t.string(),
    faction: t.string().index('btree'),
    credits: t.u64(),
    energy: t.u64(),
    matter: t.u64(),
    data: t.u64(),
    aggression: t.u32(),
  }
);

const agentIntent = table(
  { name: 'agent_intent', public: true },
  {
    botId: t.u32().primaryKey(),
    callsign: t.string(),
    faction: t.string().index('btree'),
    strategy: t.string(),
    objective: t.string(),
    targetNodeId: t.u32(),
    confidence: t.u32(),
    reasoning: t.string(),
    updatedAt: t.timestamp(),
  }
);

const warCounsel = table(
  { name: 'war_counsel', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    commander: t.identity().index('btree'),
    commanderName: t.string(),
    faction: t.string().index('btree'),
    objective: t.string(),
    rationale: t.string(),
    risk: t.string(),
    recommendedAction: t.string(),
    targetNodeId: t.u32(),
    model: t.string(),
    createdAt: t.timestamp(),
  }
);

// Private config that holds the OpenAI key used by the askWarCouncil procedure.
// Not public, so it is only ever readable from inside module code / by the owner.
const aiConfig = table(
  { name: 'ai_config' },
  {
    id: t.u32().primaryKey(),
    apiKey: t.string(),
    model: t.string(),
  }
);

const orderBook = table(
  {
    name: 'order_book',
    public: true,
    indexes: [
      { accessor: 'by_asset_side', algorithm: 'btree', columns: ['asset', 'side'] },
      { accessor: 'by_owner', algorithm: 'btree', columns: ['owner'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity(),
    ownerName: t.string(),
    faction: t.string(),
    side: t.string(),
    asset: t.string(),
    price: t.u32(),
    remaining: t.u32(),
    createdAt: t.timestamp(),
  }
);

const trade = table(
  { name: 'trade', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    sequence: t.u64().unique(),
    asset: t.string().index('btree'),
    price: t.u32(),
    volume: t.u32(),
    buyer: t.string(),
    seller: t.string(),
    executedAt: t.timestamp(),
  }
);

const blockade = table(
  { name: 'blockade', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    nodeId: t.u32().index('btree'),
    owner: t.identity(),
    faction: t.string(),
    expiresAtMicros: t.u64(),
    strength: t.u32(),
  }
);

const telemetryLog = table(
  { name: 'telemetry_log', public: true },
  {
    sequence: t.u64().primaryKey(),
    operation: t.string().index('btree'),
    actor: t.string(),
    rowsTouched: t.u32(),
    wasmTransitions: t.u32(),
    shadowHops: t.u32(),
    shadowEstimatedMicros: t.u32(),
    committedAt: t.timestamp(),
  }
);

const arenaState = table(
  { name: 'arena_state', public: true },
  {
    id: t.u32().primaryKey(),
    tick: t.u64(),
    telemetrySequence: t.u64(),
    tradeSequence: t.u64(),
    totalOperations: t.u64(),
    activeBots: t.u32(),
    season: t.string(),
    lastEnergyPrice: t.u32(),
    lastMatterPrice: t.u32(),
    lastDataPrice: t.u32(),
    startedAt: t.timestamp(),
  }
);

const worldTimer = table(
  {
    name: 'world_timer',
    scheduled: (): any => worldTick,
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

const spacetimedb = schema({
  player,
  gridNode,
  unit,
  botAgent,
  agentIntent,
  warCounsel,
  aiConfig,
  orderBook,
  trade,
  blockade,
  telemetryLog,
  arenaState,
  worldTimer,
});

export default spacetimedb;

function validFaction(faction: string): boolean {
  return FACTIONS.includes(faction.toUpperCase() as (typeof FACTIONS)[number]);
}

function validAsset(asset: string): boolean {
  return ASSETS.includes(asset.toUpperCase() as (typeof ASSETS)[number]);
}

function state(ctx: any) {
  const value = ctx.db.arenaState.id.find(1);
  if (!value) throw new Error('Arena is not initialized');
  return value;
}

function telemetry(
  ctx: any,
  operation: string,
  actor: string,
  rowsTouched: number,
  wasmTransitions: number,
  shadowHops: number,
  shadowEstimatedMicros: number
) {
  const current = state(ctx);
  const sequence = current.telemetrySequence + 1n;
  ctx.db.telemetryLog.insert({
    sequence,
    operation,
    actor,
    rowsTouched,
    wasmTransitions,
    shadowHops,
    shadowEstimatedMicros,
    committedAt: ctx.timestamp,
  });
  ctx.db.arenaState.id.update({
    ...current,
    telemetrySequence: sequence,
    totalOperations: current.totalOperations + 1n,
  });

  if (sequence > BigInt(TELEMETRY_WINDOW)) {
    ctx.db.telemetryLog.sequence.delete(sequence - BigInt(TELEMETRY_WINDOW));
  }
}

function resourceBalance(playerRow: any, asset: string): bigint {
  if (asset === 'ENERGY') return playerRow.energy;
  if (asset === 'MATTER') return playerRow.matter;
  return playerRow.data;
}

function withResource(playerRow: any, asset: string, value: bigint) {
  if (asset === 'ENERGY') return { ...playerRow, energy: value };
  if (asset === 'MATTER') return { ...playerRow, matter: value };
  return { ...playerRow, data: value };
}

function seedAgentIntentsIfMissing(ctx: any) {
  if ([...ctx.db.agentIntent.iter()].length > 0) return;
  for (const bot of ctx.db.botAgent.iter()) {
    const unitRow = [...ctx.db.unit.iter()].find((candidate: any) => candidate.botId === bot.id);
    const x = unitRow?.x ?? 0;
    const y = unitRow?.y ?? 0;
    ctx.db.agentIntent.insert({
      botId: bot.id,
      callsign: bot.name,
      faction: bot.faction,
      strategy: bot.id % 3 === 0 ? 'MARKET DOMINANCE' : bot.id % 3 === 1 ? 'TERRITORIAL EXPANSION' : 'RESOURCE DENIAL',
      objective: 'Reconstructing live battlefield objective',
      targetNodeId: y * WIDTH + x,
      confidence: 50,
      reasoning: 'Evaluating sector yield, defense, market pressure, and faction position.',
      updatedAt: ctx.timestamp,
    });
  }
}

function moveUnitInternal(ctx: any, currentUnit: any, targetNode: any, actor: string) {
  const distance =
    Math.abs(Number(currentUnit.x) - Number(targetNode.x)) +
    Math.abs(Number(currentUnit.y) - Number(targetNode.y));
  if (distance !== 1) throw new Error('Target must be one adjacent sector away');
  if (targetNode.blockadeUntilMicros > ctx.timestamp.microsSinceUnixEpoch) {
    throw new Error('Node is under data blockade');
  }

  const pressure = targetNode.pressure + currentUnit.power;
  const captured = pressure >= targetNode.defense;
  ctx.db.unit.id.update({
    ...currentUnit,
    x: targetNode.x,
    y: targetNode.y,
    lastActionTick: state(ctx).tick,
  });
  ctx.db.gridNode.id.update({
    ...targetNode,
    pressure: captured ? 0 : pressure,
    controller: captured ? currentUnit.faction : targetNode.controller,
    controllingPlayer: captured ? currentUnit.owner : targetNode.controllingPlayer,
    defense: captured ? 35 + currentUnit.power : targetNode.defense,
  });
  telemetry(ctx, captured ? 'SECTOR_CAPTURE' : 'UNIT_MOVE', actor, 2, 1, 6, 36_000);
}

export const init = spacetimedb.init(ctx => {
  ctx.db.arenaState.insert({
    id: 1,
    tick: 0n,
    telemetrySequence: 0n,
    tradeSequence: 0n,
    totalOperations: 0n,
    activeBots: 18,
    season: 'GENESIS',
    lastEnergyPrice: 42,
    lastMatterPrice: 66,
    lastDataPrice: 91,
    startedAt: ctx.timestamp,
  });

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const id = y * WIDTH + x;
      const resource = ASSETS[(x * 7 + y * 11) % ASSETS.length];
      ctx.db.gridNode.insert({
        id,
        x,
        y,
        resource,
        yieldRate: 2 + ((x * 3 + y * 5) % 7),
        controller: 'NEUTRAL',
        controllingPlayer: undefined,
        defense: 28 + ((x * 13 + y * 17) % 30),
        blockadeUntilMicros: 0n,
        pressure: 0,
      });
    }
  }

  for (let i = 1; i <= 18; i += 1) {
    const faction = FACTIONS[(i - 1) % FACTIONS.length];
    const x = (i * 5) % WIDTH;
    const y = (i * 3) % HEIGHT;
    ctx.db.botAgent.insert({
      id: i,
      name: `SYN-${String(i).padStart(2, '0')}`,
      faction,
      credits: 2000n,
      energy: 250n,
      matter: 250n,
      data: 250n,
      aggression: 35 + ((i * 13) % 60),
    });
    ctx.db.agentIntent.insert({
      botId: i,
      callsign: `SYN-${String(i).padStart(2, '0')}`,
      faction,
      strategy: i % 3 === 0 ? 'MARKET DOMINANCE' : i % 3 === 1 ? 'TERRITORIAL EXPANSION' : 'RESOURCE DENIAL',
      objective: 'Acquiring initial battlefield signal',
      targetNodeId: y * WIDTH + x,
      confidence: 50,
      reasoning: 'Boot sequence evaluating sector yield, defense, and faction pressure.',
      updatedAt: ctx.timestamp,
    });
    ctx.db.unit.insert({
      id: 0n,
      owner: undefined,
      botId: i,
      callsign: `SYN-${String(i).padStart(2, '0')}`,
      faction,
      x,
      y,
      power: 12 + ((i * 7) % 10),
      bot: true,
      lastActionTick: 0n,
    });
  }

  ctx.db.worldTimer.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.interval(1_000_000n),
  });
});

export const onConnect = spacetimedb.clientConnected(ctx => {
  seedAgentIntentsIfMissing(ctx);
  const existing = ctx.db.player.identity.find(ctx.sender);
  if (existing) {
    ctx.db.player.identity.update({ ...existing, online: true });
  }
});

export const onDisconnect = spacetimedb.clientDisconnected(ctx => {
  const existing = ctx.db.player.identity.find(ctx.sender);
  if (existing) {
    ctx.db.player.identity.update({ ...existing, online: false });
  }
});

export const joinArena = spacetimedb.reducer(
  { name: t.string(), faction: t.string() },
  (ctx, { name, faction }) => {
    const normalizedName = name.trim().slice(0, 18);
    const normalizedFaction = faction.toUpperCase();
    if (normalizedName.length < 2) throw new Error('Callsign must be at least 2 characters');
    if (!validFaction(normalizedFaction)) throw new Error('Unknown faction');

    const existing = ctx.db.player.identity.find(ctx.sender);
    if (existing) {
      ctx.db.player.identity.update({
        ...existing,
        name: normalizedName,
        faction: normalizedFaction,
        online: true,
      });
      return;
    }

    ctx.db.player.insert({
      identity: ctx.sender,
      name: normalizedName,
      faction: normalizedFaction,
      credits: 2400n,
      energy: 320n,
      matter: 260n,
      data: 220n,
      score: 0n,
      online: true,
      joinedAt: ctx.timestamp,
    });
    ctx.db.unit.insert({
      id: 0n,
      owner: ctx.sender,
      botId: 0,
      callsign: normalizedName,
      faction: normalizedFaction,
      x: normalizedFaction === 'HELIX' ? 0 : normalizedFaction === 'NOVA' ? WIDTH - 1 : 5,
      y: normalizedFaction === 'HELIX' ? 0 : normalizedFaction === 'NOVA' ? HEIGHT - 1 : 3,
      power: 24,
      bot: false,
      lastActionTick: state(ctx).tick,
    });
    telemetry(ctx, 'PLAYER_JOIN', normalizedName, 2, 1, 5, 28_000);
  }
);

export const moveUnit = spacetimedb.reducer(
  { unitId: t.u64(), targetNodeId: t.u32() },
  (ctx, { unitId, targetNodeId }) => {
    const playerRow = ctx.db.player.identity.find(ctx.sender);
    if (!playerRow) throw new Error('Join arena first');
    const currentUnit = ctx.db.unit.id.find(unitId);
    if (!currentUnit || !currentUnit.owner?.equals(ctx.sender)) throw new Error('Unit not found');
    const targetNode = ctx.db.gridNode.id.find(targetNodeId);
    if (!targetNode) throw new Error('Target node not found');
    moveUnitInternal(ctx, currentUnit, targetNode, playerRow.name);
  }
);

export const deployBlockade = spacetimedb.reducer(
  { nodeId: t.u32() },
  (ctx, { nodeId }) => {
    const playerRow = ctx.db.player.identity.find(ctx.sender);
    if (!playerRow) throw new Error('Join arena first');
    if (playerRow.data < 80n || playerRow.energy < 40n) {
      throw new Error('Need 80 DATA and 40 ENERGY');
    }
    const node = ctx.db.gridNode.id.find(nodeId);
    if (!node) throw new Error('Node not found');
    const expiresAtMicros = ctx.timestamp.microsSinceUnixEpoch + 12_000_000n;
    ctx.db.player.identity.update({
      ...playerRow,
      data: playerRow.data - 80n,
      energy: playerRow.energy - 40n,
      score: playerRow.score + 25n,
    });
    ctx.db.gridNode.id.update({
      ...node,
      blockadeUntilMicros: expiresAtMicros,
      defense: node.defense + 20,
    });
    ctx.db.blockade.insert({
      id: 0n,
      nodeId,
      owner: ctx.sender,
      faction: playerRow.faction,
      expiresAtMicros,
      strength: 20,
    });
    telemetry(ctx, 'DATA_BLOCKADE', playerRow.name, 3, 1, 8, 61_000);
  }
);

export const placeOrder = spacetimedb.reducer(
  { side: t.string(), asset: t.string(), price: t.u32(), volume: t.u32() },
  (ctx, { side, asset, price, volume }) => {
    const playerRow = ctx.db.player.identity.find(ctx.sender);
    if (!playerRow) throw new Error('Join arena first');
    const normalizedSide = side.toUpperCase();
    const normalizedAsset = asset.toUpperCase();
    if (normalizedSide !== 'BUY' && normalizedSide !== 'SELL') throw new Error('Side must be BUY or SELL');
    if (!validAsset(normalizedAsset)) throw new Error('Unknown asset');
    if (price < 1 || price > 10000 || volume < 1 || volume > 5000) throw new Error('Invalid order limits');
    const value = BigInt(price) * BigInt(volume);
    if (normalizedSide === 'BUY' && playerRow.credits < value) throw new Error('Insufficient credits');
    if (normalizedSide === 'SELL' && resourceBalance(playerRow, normalizedAsset) < BigInt(volume)) {
      throw new Error(`Insufficient ${normalizedAsset}`);
    }

    const candidates = [...ctx.db.orderBook.by_asset_side.filter([normalizedAsset, normalizedSide === 'BUY' ? 'SELL' : 'BUY'])]
      .filter((order: any) =>
        !order.owner.equals(ctx.sender) &&
        (normalizedSide === 'BUY' ? order.price <= price : order.price >= price)
      )
      .sort((a: any, b: any) => normalizedSide === 'BUY' ? a.price - b.price : b.price - a.price);

    let remaining = volume;
    let actorRow = playerRow;
    for (const opposite of candidates) {
      if (remaining === 0) break;
      const otherPlayer = ctx.db.player.identity.find(opposite.owner);
      if (!otherPlayer) continue;
      const matched = Math.min(remaining, opposite.remaining);
      const tradePrice = opposite.price;
      const tradeValue = BigInt(tradePrice) * BigInt(matched);
      if (normalizedSide === 'BUY') {
        if (actorRow.credits < tradeValue) break;
        actorRow = withResource(
          { ...actorRow, credits: actorRow.credits - tradeValue },
          normalizedAsset,
          resourceBalance(actorRow, normalizedAsset) + BigInt(matched)
        );
        ctx.db.player.identity.update(actorRow);
        ctx.db.player.identity.update({ ...otherPlayer, credits: otherPlayer.credits + tradeValue });
      } else {
        if (resourceBalance(actorRow, normalizedAsset) < BigInt(matched)) break;
        actorRow = withResource(
          { ...actorRow, credits: actorRow.credits + tradeValue },
          normalizedAsset,
          resourceBalance(actorRow, normalizedAsset) - BigInt(matched)
        );
        ctx.db.player.identity.update(actorRow);
        ctx.db.player.identity.update(
          withResource(
            otherPlayer,
            normalizedAsset,
            resourceBalance(otherPlayer, normalizedAsset) + BigInt(matched)
          )
        );
      }

      remaining -= matched;
      if (opposite.remaining === matched) {
        ctx.db.orderBook.id.delete(opposite.id);
      } else {
        ctx.db.orderBook.id.update({ ...opposite, remaining: opposite.remaining - matched });
      }

      const current = state(ctx);
      const tradeSequence = current.tradeSequence + 1n;
      ctx.db.trade.insert({
        id: 0n,
        sequence: tradeSequence,
        asset: normalizedAsset,
        price: tradePrice,
        volume: matched,
        buyer: normalizedSide === 'BUY' ? playerRow.name : opposite.ownerName,
        seller: normalizedSide === 'SELL' ? playerRow.name : opposite.ownerName,
        executedAt: ctx.timestamp,
      });
      ctx.db.arenaState.id.update({
        ...current,
        tradeSequence,
        lastEnergyPrice: normalizedAsset === 'ENERGY' ? tradePrice : current.lastEnergyPrice,
        lastMatterPrice: normalizedAsset === 'MATTER' ? tradePrice : current.lastMatterPrice,
        lastDataPrice: normalizedAsset === 'DATA' ? tradePrice : current.lastDataPrice,
      });
    }

    if (remaining > 0) {
      if (normalizedSide === 'BUY') {
        const escrow = BigInt(price) * BigInt(remaining);
        if (actorRow.credits < escrow) throw new Error('Insufficient credits for remaining order');
        actorRow = { ...actorRow, credits: actorRow.credits - escrow };
      } else {
        const available = resourceBalance(actorRow, normalizedAsset);
        if (available < BigInt(remaining)) throw new Error(`Insufficient ${normalizedAsset} for remaining order`);
        actorRow = withResource(actorRow, normalizedAsset, available - BigInt(remaining));
      }
      ctx.db.player.identity.update(actorRow);
      ctx.db.orderBook.insert({
        id: 0n,
        owner: ctx.sender,
        ownerName: playerRow.name,
        faction: playerRow.faction,
        side: normalizedSide,
        asset: normalizedAsset,
        price,
        remaining,
        createdAt: ctx.timestamp,
      });
    }
    telemetry(ctx, remaining === volume ? 'ORDER_PLACED' : 'ORDER_MATCHED', playerRow.name, 2 + candidates.length, 1, 9, 52_000);
  }
);

export const cancelOrder = spacetimedb.reducer(
  { orderId: t.u64() },
  (ctx, { orderId }) => {
    const order = ctx.db.orderBook.id.find(orderId);
    if (!order || !order.owner.equals(ctx.sender)) throw new Error('Order not found');
    const playerRow = ctx.db.player.identity.find(ctx.sender);
    if (!playerRow) throw new Error('Player not found');
    if (order.side === 'BUY') {
      ctx.db.player.identity.update({
        ...playerRow,
        credits: playerRow.credits + BigInt(order.price) * BigInt(order.remaining),
      });
    } else {
      ctx.db.player.identity.update(
        withResource(
          playerRow,
          order.asset,
          resourceBalance(playerRow, order.asset) + BigInt(order.remaining)
        )
      );
    }
    ctx.db.orderBook.id.delete(orderId);
    telemetry(ctx, 'ORDER_CANCELLED', playerRow.name, 2, 1, 5, 31_000);
  }
);

// ---------------------------------------------------------------------------
// AI War Council — runs entirely inside SpacetimeDB.
// `askWarCouncil` is a Procedure (SpacetimeDB 2.0+): it can reach the outside
// world via ctx.http.fetch to call an LLM, then commit the plan with ctx.withTx.
// No external Node service is required.
// ---------------------------------------------------------------------------

const CounselResult = t.object('CounselResult', {
  objective: t.string(),
  rationale: t.string(),
  risk: t.string(),
  recommendedAction: t.string(),
  targetNodeId: t.u32(),
  model: t.string(),
  mode: t.string(),
});

function counselFallback(snap: any) {
  const unit = snap.unit;
  const score = (node: any) =>
    node.yieldRate * 8 - node.defense + (node.controller === snap.faction ? -20 : 15);
  const candidates = snap.nodes
    .filter((node: any) => Math.abs(node.x - unit.x) + Math.abs(node.y - unit.y) <= 1)
    .sort((a: any, b: any) => score(b) - score(a));
  const target = candidates[0] ?? snap.nodes[0] ?? { id: 0, x: 0, y: 0, resource: 'ENERGY', yieldRate: 0, defense: 0 };
  return {
    objective: `Seize sector ${target.x + 1}.${target.y + 1}`,
    rationale: `${target.resource} yield ${target.yieldRate} is the strongest adjacent value against defense ${target.defense}. Computed in-database; set an OpenAI key via configureWarCouncil for full LLM strategy.`,
    risk: target.defense > 55 ? 'High defense may require repeated pressure.' : 'Counter-capture risk from nearby agents.',
    recommendedAction: `March to ${target.x + 1}.${target.y + 1}, then hold the lane with a data blockade.`,
    targetNodeId: target.id,
  };
}

function requestCounselFromLlm(ctx: any, question: string, snap: any) {
  const system = [
    'You are the strategic AI of Project Hyperion, a real-time economic-warfare game.',
    'Pick exactly one legal sector target with id between 0 and 95.',
    'Balance territory yield, market prices, faction pressure, unit adjacency, and blockade risk.',
    'Return ONLY strict JSON with this exact shape:',
    '{"objective":string,"rationale":string,"risk":string,"recommendedAction":string,"targetNodeId":integer}',
  ].join(' ');
  const userMessage = `COMMANDER QUESTION: ${question}\nLIVE SPACETIMEDB SNAPSHOT: ${JSON.stringify({
    player: { name: snap.name, faction: snap.faction, credits: snap.credits, energy: snap.energy, matter: snap.matter, data: snap.data },
    unit: snap.unit,
    prices: snap.prices,
    nodes: snap.nodes,
    agents: snap.intents,
  })}`;

  const response = ctx.http.fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${snap.apiKey}` },
    body: JSON.stringify({
      model: snap.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    }),
    timeout: TimeDuration.fromMillis(15_000),
  });

  if (response.status !== 200) throw new Error(`OpenAI returned status ${response.status}`);
  const data = response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned no content');
  const parsed = JSON.parse(content);
  return {
    objective: (String(parsed.objective ?? '').trim() || 'Hold position').slice(0, 120),
    rationale: (String(parsed.rationale ?? '').trim() || 'No rationale provided.').slice(0, 420),
    risk: (String(parsed.risk ?? '').trim() || 'Risk unknown.').slice(0, 180),
    recommendedAction: (String(parsed.recommendedAction ?? '').trim() || 'Reassess next tick.').slice(0, 180),
    targetNodeId: Math.max(0, Math.min(95, Math.trunc(Number(parsed.targetNodeId)) || 0)),
  };
}

// Owner sets the OpenAI key once (e.g. `spacetime call hyperion-popxo configure_war_council '"sk-..."' '"gpt-4o-mini"'`).
export const configureWarCouncil = spacetimedb.reducer(
  { apiKey: t.string(), model: t.string() },
  (ctx, { apiKey, model }) => {
    const row = {
      id: 1,
      apiKey: apiKey.trim().slice(0, 240),
      model: (model.trim() || 'gpt-4o-mini').slice(0, 60),
    };
    const existing = ctx.db.aiConfig.id.find(1);
    if (existing) ctx.db.aiConfig.id.update(row);
    else ctx.db.aiConfig.insert(row);
  }
);

export const askWarCouncil = spacetimedb.procedure(
  { name: 'ask_war_council' },
  { question: t.string() },
  CounselResult,
  (ctx, { question }) => {
    const prompt = (question.trim().length > 0 ? question.trim() : 'What is my highest-value next move?').slice(0, 500);

    const snap = ctx.withTx((tx: any) => {
      const playerRow = tx.db.player.identity.find(ctx.sender);
      if (!playerRow) throw new SenderError('Join the arena before consulting the War Council');
      const unitRow = [...tx.db.unit.iter()].find((u: any) => u.owner && u.owner.equals(ctx.sender));
      const nodes = [...tx.db.gridNode.iter()].map((node: any) => ({
        id: Number(node.id), x: Number(node.x), y: Number(node.y), resource: node.resource,
        yieldRate: Number(node.yieldRate), controller: node.controller,
        defense: Number(node.defense), pressure: Number(node.pressure),
        blocked: node.blockadeUntilMicros !== 0n,
      }));
      const intents = [...tx.db.agentIntent.iter()].slice(0, 12).map((intent: any) => ({
        callsign: intent.callsign, faction: intent.faction, objective: intent.objective,
        targetNodeId: Number(intent.targetNodeId), confidence: Number(intent.confidence),
      }));
      const arena = tx.db.arenaState.id.find(1);
      const cfg = tx.db.aiConfig.id.find(1);
      return {
        name: playerRow.name, faction: playerRow.faction,
        credits: Number(playerRow.credits), energy: Number(playerRow.energy),
        matter: Number(playerRow.matter), data: Number(playerRow.data),
        unit: unitRow ? { x: Number(unitRow.x), y: Number(unitRow.y), power: Number(unitRow.power) } : { x: 0, y: 0, power: 24 },
        nodes, intents,
        prices: {
          energy: Number(arena?.lastEnergyPrice ?? 0),
          matter: Number(arena?.lastMatterPrice ?? 0),
          data: Number(arena?.lastDataPrice ?? 0),
        },
        apiKey: cfg?.apiKey ?? '',
        model: cfg?.model && cfg.model.length > 0 ? cfg.model : 'gpt-4o-mini',
      };
    });

    let counsel;
    let modelLabel: string;
    let mode: string;
    if (snap.apiKey.length > 0) {
      try {
        counsel = requestCounselFromLlm(ctx, prompt, snap);
        modelLabel = snap.model;
        mode = 'openai';
      } catch {
        counsel = counselFallback(snap);
        modelLabel = 'deterministic-fallback';
        mode = 'fallback';
      }
    } else {
      counsel = counselFallback(snap);
      modelLabel = 'deterministic-fallback';
      mode = 'fallback';
    }

    const committedTarget = ctx.withTx((tx: any) => {
      const target = tx.db.gridNode.id.find(counsel.targetNodeId) ? counsel.targetNodeId : 0;
      tx.db.warCounsel.insert({
        id: 0n,
        commander: ctx.sender,
        commanderName: snap.name,
        faction: snap.faction,
        objective: counsel.objective,
        rationale: counsel.rationale,
        risk: counsel.risk,
        recommendedAction: counsel.recommendedAction,
        targetNodeId: target,
        model: modelLabel,
        createdAt: ctx.timestamp,
      });
      telemetry(tx, 'AI_COUNSEL_COMMITTED', snap.name, 1, 1, 7, 48_000);
      return target;
    });

    return { ...counsel, targetNodeId: committedTarget, model: modelLabel, mode };
  }
);

export const recordWarCounsel = spacetimedb.reducer(
  {
    objective: t.string(),
    rationale: t.string(),
    risk: t.string(),
    recommendedAction: t.string(),
    targetNodeId: t.u32(),
    model: t.string(),
  },
  (ctx, { objective, rationale, risk, recommendedAction, targetNodeId, model }) => {
    const playerRow = ctx.db.player.identity.find(ctx.sender);
    if (!playerRow) throw new Error('Join arena first');
    if (!ctx.db.gridNode.id.find(targetNodeId)) throw new Error('Target node not found');
    ctx.db.warCounsel.insert({
      id: 0n,
      commander: ctx.sender,
      commanderName: playerRow.name,
      faction: playerRow.faction,
      objective: objective.trim().slice(0, 120),
      rationale: rationale.trim().slice(0, 420),
      risk: risk.trim().slice(0, 180),
      recommendedAction: recommendedAction.trim().slice(0, 180),
      targetNodeId,
      model: model.trim().slice(0, 40),
      createdAt: ctx.timestamp,
    });
    telemetry(ctx, 'AI_COUNSEL_COMMITTED', playerRow.name, 1, 1, 7, 48_000);
  }
);

export const worldTick = spacetimedb.reducer(
  { timer: worldTimer.rowType },
  (ctx, _args) => {
    const current = state(ctx);
    const nextTick = current.tick + 1n;
    ctx.db.arenaState.id.update({ ...current, tick: nextTick });

    let touched = 1;
    for (const node of ctx.db.gridNode.iter()) {
      if (node.controllingPlayer) {
        const controller = ctx.db.player.identity.find(node.controllingPlayer);
        if (controller) {
          const gain = BigInt(node.yieldRate);
          ctx.db.player.identity.update(
            withResource(
              { ...controller, score: controller.score + gain },
              node.resource,
              resourceBalance(controller, node.resource) + gain
            )
          );
          touched += 1;
        }
      }
      if (node.blockadeUntilMicros !== 0n && node.blockadeUntilMicros <= ctx.timestamp.microsSinceUnixEpoch) {
        ctx.db.gridNode.id.update({ ...node, blockadeUntilMicros: 0n, defense: Math.max(20, node.defense - 20) });
        touched += 1;
      }
    }

    const botUnits = [...ctx.db.unit.by_faction.filter(FACTIONS[Number(nextTick % 3n)])]
      .filter((candidate: any) => candidate.bot)
      .slice(0, 6);
    for (const bot of botUnits) {
      const dx = ctx.random.integerInRange(-1, 1);
      const dy = dx === 0 ? ctx.random.integerInRange(-1, 1) : 0;
      const x = Math.max(0, Math.min(WIDTH - 1, Number(bot.x) + dx));
      const y = Math.max(0, Math.min(HEIGHT - 1, Number(bot.y) + dy));
      const target = ctx.db.gridNode.id.find(y * WIDTH + x);
      if (!target || target.blockadeUntilMicros > ctx.timestamp.microsSinceUnixEpoch) continue;
      const pressure = target.pressure + bot.power;
      const captured = pressure >= target.defense;
      ctx.db.unit.id.update({ ...bot, x, y, lastActionTick: nextTick });
      ctx.db.gridNode.id.update({
        ...target,
        pressure: captured ? 0 : pressure,
        controller: captured ? bot.faction : target.controller,
        controllingPlayer: captured ? undefined : target.controllingPlayer,
        defense: captured ? 32 + bot.power : target.defense,
      });
      const intent = ctx.db.agentIntent.botId.find(bot.botId);
      if (intent) {
        const strategy =
          target.resource === 'DATA'
            ? 'RESOURCE DENIAL'
            : target.yieldRate >= 6
              ? 'YIELD CAPTURE'
              : captured
                ? 'FRONT CONSOLIDATION'
                : 'PRESSURE BUILD';
        ctx.db.agentIntent.botId.update({
          ...intent,
          strategy,
          objective: captured
            ? `Secure sector ${target.x + 1}.${target.y + 1}`
            : `Break defense at ${target.x + 1}.${target.y + 1}`,
          targetNodeId: target.id,
          confidence: Math.min(97, 42 + bot.power + (captured ? 24 : 0)),
          reasoning: captured
            ? `${target.resource} yield acquired. Rebalancing toward adjacent hostile pressure.`
            : `Target defense ${target.defense}; accumulated pressure ${pressure}. Continuing atomic advance.`,
          updatedAt: ctx.timestamp,
        });
        touched += 1;
      }
      touched += 2;
    }

    if (nextTick % 3n === 0n) {
      telemetry(ctx, 'WORLD_TICK', 'SCHEDULER', touched, botUnits.length + 1, 12, 72_000 + touched * 120);
    }
  }
);
