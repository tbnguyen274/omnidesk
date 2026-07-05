import type {
  ApiResponse,
  ConversationDetail,
  ConversationFilters,
  ConversationListResponse,
  ConversationMessage,
  ConversationStatus,
  CreateOutboundMessagePayload,
  CreateOutboundMessageResponse,
  CurrentUser,
  LoginResponse,
  Priority,
  DashboardSummary,
  AgentPerformance,
  UserRole,
} from "./api-types";
import { API_BASE_URL } from "./app-config";

type RequestOptions = {
  token?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  skipAuthRefresh?: boolean;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

let refreshPromise: Promise<unknown> | null = null;

async function refreshSession() {
  refreshPromise ??= request<{ success: boolean }>("/auth/refresh", "POST", {
    skipAuthRefresh: true,
  }).finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

async function request<T>(
  path: string,
  method = "GET",
  options: RequestOptions = {},
) {
  const url = new URL(`${API_BASE_URL}${path}`);

  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url.toString(), {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiResponse<T>
    | { message?: string; error?: { message?: string } }
    | null;

  if (
    response.status === 401 &&
    !options.skipAuthRefresh &&
    path !== "/auth/refresh"
  ) {
    await refreshSession();
    return request<T>(path, method, {
      ...options,
      skipAuthRefresh: true,
    });
  }

  if (!response.ok) {
    const message =
      payload && "error" in payload
        ? payload.error?.message
        : payload?.message;
    throw new ApiError(message ?? "Request failed", response.status);
  }

  if (!payload || !("data" in payload)) {
    throw new ApiError("Invalid API response", response.status);
  }

  return payload.data;
}

export const apiClient = {
  baseUrl: API_BASE_URL,

  login(email: string, password: string) {
    return request<LoginResponse>("/auth/login", "POST", {
      body: { email, password },
    });
  },

  refresh() {
    return refreshSession();
  },

  logout() {
    return request<{ success: boolean }>("/auth/logout", "POST");
  },

  forgotPassword(email: string) {
    return request<{ success: boolean }>("/auth/forgot-password", "POST", {
      body: { email },
    });
  },

  resetPassword(token: string, newPassword: string) {
    return request<{ success: boolean }>("/auth/reset-password", "POST", {
      body: { token, newPassword },
    });
  },

  me(token: string) {
    return request<CurrentUser>("/auth/me", "GET", { token });
  },

  conversations(token: string, filters: ConversationFilters) {
    return request<ConversationListResponse>("/conversations", "GET", {
      token,
      query: {
        ...filters,
        page: 1,
        limit: 50,
      },
    });
  },

  conversation(token: string, id: string) {
    return request<ConversationDetail>(`/conversations/${id}`, "GET", {
      token,
    });
  },

  updateConversationStatus(
    token: string,
    id: string,
    status: ConversationStatus,
    version: number,
  ) {
    return request<ConversationDetail>(`/conversations/${id}/status`, "PATCH", {
      token,
      body: { status, version },
    });
  },

  updateConversationPriority(token: string, id: string, priority: Priority, version: number) {
    return request<ConversationDetail>(
      `/conversations/${id}/priority`,
      "PATCH",
      {
        token,
        body: { priority, version },
      },
    );
  },

  assignConversation(token: string, id: string, assignedAgentId: string | null, version: number) {
    return request<ConversationDetail>(
      `/conversations/${id}/assignment`,
      "PATCH",
      {
        token,
        body: { assignedAgentId, version },
      },
    );
  },

  updateConversationReadStatus(token: string, id: string, isRead: boolean, version: number) {
    return request<ConversationDetail>(
      `/conversations/${id}/read-status`,
      "PATCH",
      {
        token,
        body: { isRead, version },
      },
    );
  },

  getConversationMessages(token: string, id: string, cursor?: string) {
    const query = cursor ? `?cursor=${cursor}` : "";
    return request<ConversationMessage[]>(
      `/conversations/${id}/messages${query}`,
      "GET",
      { token },
    );
  },

  createOutboundMessage(
    token: string,
    payload: CreateOutboundMessagePayload,
  ) {
    return request<CreateOutboundMessageResponse>("/outbound/messages", "POST", {
      token,
      body: payload,
    });
  },

  getDashboardSummary(token: string) {
    return request<DashboardSummary>("/dashboard/summary", "GET", {
      token,
    });
  },

  getAgentPerformance(token: string) {
    return request<AgentPerformance[]>("/dashboard/agent-performance", "GET", {
      token,
    });
  },

  getUsers(token: string) {
    return request<CurrentUser[]>("/users", "GET", {
      token,
    });
  },

  createUser(token: string, data: { name: string; email: string; role: UserRole }) {
    return request<CurrentUser>("/users", "POST", {
      token,
      body: data,
    });
  },

  updateUserStatus(token: string, id: string, status: string) {
    return request<CurrentUser>(`/users/${id}/status`, "PATCH", {
      token,
      body: { status },
    });
  },

  getAgents(token: string) {
    return request<{ id: string; name: string; email: string }[]>("/users/agents", "GET", {
      token,
    });
  },

  getTags(token: string) {
    return request<{ id: string; name: string; color: string | null }[]>("/tags", "GET", {
      token,
    });
  },

  createTag(token: string, name: string, color?: string) {
    return request<{ id: string; name: string; color: string | null }>("/tags", "POST", {
      token,
      body: { name, color },
    });
  },

  addConversationTag(token: string, conversationId: string, tagId: string) {
    return request(`/conversations/${conversationId}/tags`, "POST", {
      token,
      body: { tagId },
    });
  },

  removeConversationTag(token: string, conversationId: string, tagId: string) {
    return request(`/conversations/${conversationId}/tags/${tagId}`, "DELETE", {
      token,
    });
  },
};
