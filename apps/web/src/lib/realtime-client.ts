import type { RealtimeEvent } from "@omnidesk/shared";
import { io, type Socket } from "socket.io-client";
import { REALTIME_URL } from "./app-config";

export type RealtimeConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

type ServerToClientEvents = {
  "conversation.joined": (payload: { room: string }) => void;
  "conversation.left": (payload: { room: string }) => void;
  "realtime.error": (payload: { message: string }) => void;
  "realtime.event": (event: RealtimeEvent) => void;
};

type ClientToServerEvents = {
  "conversation.join": (payload: { conversationId: string }) => void;
  "conversation.leave": (payload: { conversationId: string }) => void;
  "agent_typing": (payload: { conversationId: string; isTyping: boolean }) => void;
};

export function createRealtimeSocket(token: string): RealtimeSocket {
  return io(REALTIME_URL, {
    auth: { token },
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    transports: ["websocket"],
  });
}

export function joinConversationRoom(
  socket: RealtimeSocket,
  conversationId: string,
) {
  socket.emit("conversation.join", { conversationId });
}

export function leaveConversationRoom(
  socket: RealtimeSocket,
  conversationId: string,
) {
  socket.emit("conversation.leave", { conversationId });
}
