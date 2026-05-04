// REALTIME CONTRACT:
// - WS URL: VITE_WS_BASE_URL/messaging?token=<jwt>
// - Server pushes: message.received, typing, read_receipt, presence (optional: { member_id|user_id, ts? })
// - If the backend uses a different transport (SSE, long poll), replace this hook's internals
//   but keep the returned interface: { sendMessage, markRead, typingState }

import { useEffect, useRef, useState } from 'react'
import { useMemberPresenceStore } from '../store/memberPresenceStore'
import type { MessageRecord } from '../types/messaging'

type TypingState = Record<string, string | null>

type SocketHookProps = {
  token: string | null
  onMessageReceived: (message: MessageRecord) => void
  onReadReceipt: (payload: { thread_id: string; up_to_message_id: string }) => void
  onPollingFallback?: () => void
}

export function useMessagingSocket({ token, onMessageReceived, onReadReceipt, onPollingFallback }: SocketHookProps) {
  const wsRef = useRef<WebSocket | null>(null)
  const [typingState, setTypingState] = useState<TypingState>({})

  useEffect(() => {
    if (!token) {
      return
    }

    const wsBaseUrl = String(import.meta.env.VITE_WS_BASE_URL ?? '').replace(/\/$/, '')
    const wsEnabled = String(import.meta.env.VITE_ENABLE_MESSAGING_WS ?? 'false').toLowerCase() === 'true'
    if (!wsEnabled || !wsBaseUrl) {
      onPollingFallback?.()
      return
    }

    const wsUrl = `${wsBaseUrl}/messaging?token=${encodeURIComponent(token)}`
    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data) as { type: string; payload: any }
        if (data.type === 'message.received') {
          onMessageReceived(data.payload as MessageRecord)
        }
        if (data.type === 'typing') {
          const payload = data.payload as { thread_id: string; user_id: string }
          setTypingState((prev) => ({ ...prev, [payload.thread_id]: payload.user_id }))
          window.setTimeout(() => {
            setTypingState((prev) => ({ ...prev, [payload.thread_id]: null }))
          }, 1800)
        }
        if (data.type === 'read_receipt') {
          onReadReceipt(data.payload as { thread_id: string; up_to_message_id: string })
        }
        if (data.type === 'presence' || data.type === 'presence.heartbeat') {
          const p = data.payload as { member_id?: string; user_id?: string; ts?: number }
          const id = p.member_id ?? p.user_id
          if (id) {
            useMemberPresenceStore.getState().touch(id, typeof p.ts === 'number' ? p.ts : Date.now())
          }
        }
      }

      ws.onerror = () => {
        console.warn('Messaging socket unavailable, falling back to polling every 5s')
        onPollingFallback?.()
      }

      return () => {
        ws.close()
      }
    } catch {
      console.warn('Messaging socket unavailable, falling back to polling every 5s')
      onPollingFallback?.()
      return
    }
  }, [token, onMessageReceived, onReadReceipt, onPollingFallback])

  function sendMessage(payload: { thread_id: string; text: string; sender_id: string }): void {
    wsRef.current?.send(JSON.stringify({ type: 'message.send', payload }))
  }

  function markRead(payload: { thread_id: string; up_to_message_id: string }): void {
    wsRef.current?.send(JSON.stringify({ type: 'message.read', payload }))
  }

  return { sendMessage, markRead, typingState }
}
