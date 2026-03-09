'use client'
import { useMemo, useState } from 'react'
import { useTranslation } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'

// ── Types ────────────────────────────────────────────────────────
interface AgentNode {
  id: string
  role: string
  name: string
}

interface AgentEdge {
  from: string
  to: string
  count: number
  lastMessage?: string
}

interface AgentGraphProps {
  agents: AgentNode[]
  edges: AgentEdge[]
  /** Peer relationships from agent config — shown as dashed topology lines */
  peers?: Record<string, string[]>
  /** Currently selected edge (from↔to) */
  selectedEdge?: string | null
  onEdgeClick?: (from: string, to: string) => void
  onNodeClick?: (id: string) => void
}

// ── Constants ────────────────────────────────────────────────────
const ROLE_EMOJI: Record<string, string> = {
  pm: '📋', product: '📦', designer: '🎨', frontend: '💻',
  backend: '⚙️', tester: '🧪', researcher: '🔬',
  ceo: '👔', marketing: '📣', analyst: '📊', writer: '✍️',
}

const NODE_RADIUS = 28
const GRAPH_PADDING = 60

/**
 * AgentGraph — SVG circular graph showing agent-to-agent communication.
 *
 * Layout: agents arranged in a circle.
 * Edges: curved lines between connected agents, width = message count.
 * Interaction: click edge to see messages, click node to select agent.
 */
export function AgentGraph({ agents, edges, peers, selectedEdge, onEdgeClick, onNodeClick }: AgentGraphProps) {
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  // ── Compute layout ─────────────────────────────────────────────
  const layout = useMemo(() => {
    const n = agents.length
    if (n === 0) return { nodes: [], width: 300, height: 200 }

    // Responsive sizing
    const radius = Math.max(80, Math.min(150, n * 25))
    const width = (radius + GRAPH_PADDING) * 2
    const height = (radius + GRAPH_PADDING) * 2
    const cx = width / 2
    const cy = height / 2

    const nodes = agents.map((agent, i) => {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2 // Start from top
      return {
        ...agent,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      }
    })

    return { nodes, width, height }
  }, [agents])

  // ── Edge key helper ────────────────────────────────────────────
  const edgeKey = (a: string, b: string) => [a, b].sort().join('↔')

  // ── Compute topology edges from peers (deduplicated) ──────────
  const topologyEdges = useMemo(() => {
    if (!peers) return []
    const seen = new Set<string>()
    const messageEdgeKeys = new Set(edges.map(e => edgeKey(e.from, e.to)))
    const result: { from: string; to: string }[] = []
    for (const [agentId, peerList] of Object.entries(peers)) {
      for (const peerId of peerList) {
        const key = edgeKey(agentId, peerId)
        if (!seen.has(key) && !messageEdgeKeys.has(key)) {
          seen.add(key)
          result.push({ from: agentId, to: peerId })
        }
      }
    }
    return result
  }, [peers, edges])

  // ── Max count for scaling line width ───────────────────────────
  const maxCount = Math.max(1, ...edges.map(e => e.count))

  // ── Find node position by id ───────────────────────────────────
  const nodePos = (id: string) => layout.nodes.find(n => n.id === id)

  if (agents.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
        No agents
      </div>
    )
  }

  return (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      className="w-full max-h-[400px]"
      style={{ minHeight: 200 }}
    >
      {/* Topology edges (peers, no messages yet) — dashed lines */}
      {topologyEdges.map(edge => {
        const from = nodePos(edge.from)
        const to = nodePos(edge.to)
        if (!from || !to) return null

        const key = edgeKey(edge.from, edge.to)
        const isSelected = selectedEdge === key
        const isHovered = hoveredEdge === key

        const midX = (from.x + to.x) / 2
        const midY = (from.y + to.y) / 2
        const dx = to.x - from.x
        const dy = to.y - from.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const offsetScale = dist * 0.15
        const cpx = midX + (-dy / dist) * offsetScale
        const cpy = midY + (dx / dist) * offsetScale

        return (
          <g key={`topo-${key}`}>
            <path
              d={`M ${from.x} ${from.y} Q ${cpx} ${cpy} ${to.x} ${to.y}`}
              fill="none"
              stroke="transparent"
              strokeWidth={20}
              className="cursor-pointer"
              onClick={() => onEdgeClick?.(edge.from, edge.to)}
              onMouseEnter={() => setHoveredEdge(key)}
              onMouseLeave={() => setHoveredEdge(null)}
            />
            <path
              d={`M ${from.x} ${from.y} Q ${cpx} ${cpy} ${to.x} ${to.y}`}
              fill="none"
              stroke={isSelected || isHovered ? 'hsl(210, 60%, 45%)' : 'hsl(216, 20%, 35%)'}
              strokeWidth={1.5}
              strokeDasharray="6 4"
              opacity={isSelected || isHovered ? 0.8 : 0.35}
              className="transition-all duration-200 pointer-events-none"
            />
          </g>
        )
      })}

      {/* Message edges — solid lines */}
      {edges.map(edge => {
        const from = nodePos(edge.from)
        const to = nodePos(edge.to)
        if (!from || !to) return null

        const key = edgeKey(edge.from, edge.to)
        const isSelected = selectedEdge === key
        const isHovered = hoveredEdge === key
        const lineWidth = 1.5 + (edge.count / maxCount) * 4
        const opacity = isSelected || isHovered ? 1 : 0.4

        // Curved path (quadratic bezier through center offset)
        const midX = (from.x + to.x) / 2
        const midY = (from.y + to.y) / 2
        const dx = to.x - from.x
        const dy = to.y - from.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        // Offset the control point perpendicular to the line
        const offsetScale = dist * 0.15
        const cpx = midX + (-dy / dist) * offsetScale
        const cpy = midY + (dx / dist) * offsetScale

        return (
          <g key={key}>
            {/* Invisible fat hitbox for easier clicking */}
            <path
              d={`M ${from.x} ${from.y} Q ${cpx} ${cpy} ${to.x} ${to.y}`}
              fill="none"
              stroke="transparent"
              strokeWidth={20}
              className="cursor-pointer"
              onClick={() => onEdgeClick?.(edge.from, edge.to)}
              onMouseEnter={() => setHoveredEdge(key)}
              onMouseLeave={() => setHoveredEdge(null)}
            />
            {/* Visible line */}
            <path
              d={`M ${from.x} ${from.y} Q ${cpx} ${cpy} ${to.x} ${to.y}`}
              fill="none"
              stroke={isSelected ? 'hsl(210, 80%, 60%)' : 'hsl(215, 20%, 45%)'}
              strokeWidth={lineWidth}
              opacity={opacity}
              className="transition-all duration-200 pointer-events-none"
            />
            {/* Animated pulse on selected/hovered edge */}
            {(isSelected || isHovered) && (
              <circle r="3" fill="hsl(210, 80%, 60%)">
                <animateMotion
                  dur="2s"
                  repeatCount="indefinite"
                  path={`M ${from.x} ${from.y} Q ${cpx} ${cpy} ${to.x} ${to.y}`}
                />
              </circle>
            )}
            {/* Count label on edge midpoint */}
            {edge.count > 0 && (
              <g>
                <rect
                  x={cpx - 10} y={cpy - 8}
                  width={20} height={16} rx={4}
                  fill="hsl(224, 71%, 8%)"
                  stroke="hsl(216, 34%, 22%)"
                  strokeWidth={1}
                  opacity={isSelected || isHovered ? 1 : 0.6}
                />
                <text
                  x={cpx} y={cpy + 4}
                  textAnchor="middle"
                  fill="hsl(215, 20%, 65%)"
                  fontSize={10}
                  fontWeight={600}
                  opacity={isSelected || isHovered ? 1 : 0.6}
                >
                  {edge.count}
                </text>
              </g>
            )}
          </g>
        )
      })}

      {/* Nodes */}
      {layout.nodes.map(node => {
        const isHovered = hoveredNode === node.id
        const hasEdge = edges.some(e => e.from === node.id || e.to === node.id)

        return (
          <g
            key={node.id}
            className="cursor-pointer"
            onClick={() => onNodeClick?.(node.id)}
            onMouseEnter={() => setHoveredNode(node.id)}
            onMouseLeave={() => setHoveredNode(null)}
          >
            {/* Background circle */}
            <circle
              cx={node.x} cy={node.y} r={NODE_RADIUS}
              fill={isHovered ? 'hsl(210, 40%, 18%)' : 'hsl(224, 71%, 8%)'}
              stroke={hasEdge ? 'hsl(210, 60%, 45%)' : 'hsl(216, 34%, 22%)'}
              strokeWidth={isHovered ? 2.5 : 1.5}
              className="transition-all duration-200"
            />
            {/* Emoji */}
            <text
              x={node.x} y={node.y + 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={20}
            >
              {ROLE_EMOJI[node.role] || '🤖'}
            </text>
            {/* Label below */}
            <text
              x={node.x} y={node.y + NODE_RADIUS + 14}
              textAnchor="middle"
              fill="hsl(215, 20%, 55%)"
              fontSize={11}
              fontWeight={500}
            >
              {node.role}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
