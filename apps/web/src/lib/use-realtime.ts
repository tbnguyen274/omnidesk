"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeEvent } from "@omnidesk/shared";
import {
  createRealtimeSocket,
  joinConversationRoom,
  leaveConversationRoom,
  type RealtimeConnectionState,
  type RealtimeSocket,
} from "./realtime-client";

type UseRealtimeOptions = {
  conversationId?: string | null;
  debounceMs?: number;
  onEvents?: (events: RealtimeEvent[]) => void;
  token: string | null;
};

export function useRealtime({
  conversationId,
  debounceMs = 250,
  onEvents,
  token,
}: UseRealtimeOptions) {
  const socketRef = useRef<RealtimeSocket | null>(null);
  const pendingEventsRef = useRef<RealtimeEvent[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventsRef = useRef(onEvents);
  const [connectionState, setConnectionState] =
    useState<RealtimeConnectionState>("idle");

  useEffect(() => {
    onEventsRef.current = onEvents;
  }, [onEvents]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const socket = createRealtimeSocket(token);
    socketRef.current = socket;

    socket.on("connect", () => setConnectionState("connected"));
    socket.on("disconnect", () => setConnectionState("disconnected"));
    socket.on("connect_error", () => setConnectionState("error"));
    socket.on("realtime.error", () => setConnectionState("error"));
    socket.on("realtime.event", (event) => {
      pendingEventsRef.current.push(event);

      if (flushTimerRef.current) {
        return;
      }

      flushTimerRef.current = setTimeout(() => {
        const events = pendingEventsRef.current;
        pendingEventsRef.current = [];
        flushTimerRef.current = null;
        onEventsRef.current?.(events);
      }, debounceMs);
    });

    socket.connect();

    return () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }

      pendingEventsRef.current = [];
      socket.disconnect();
      socketRef.current = null;
      setConnectionState("idle");
    };
  }, [debounceMs, token]);

  useEffect(() => {
    const socket = socketRef.current;

    if (!socket || !conversationId || connectionState !== "connected") {
      return;
    }

    joinConversationRoom(socket, conversationId);

    return () => {
      leaveConversationRoom(socket, conversationId);
    };
  }, [conversationId, connectionState]);

  const sendTyping = (isTyping: boolean) => {
    if (socketRef.current && connectionState === "connected" && conversationId) {
      socketRef.current.emit("agent_typing", { conversationId, isTyping });
    }
  };

  return {
    connectionState,
    sendTyping,
  };
}
