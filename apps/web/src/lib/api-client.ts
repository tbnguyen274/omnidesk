import type {
  ApiResponse,
  ConversationDetail,
  ConversationFilters,
  ConversationListResponse,
  ConversationStatus,
  CreateOutboundMessagePayload,
  CreateOutboundMessageResponse,
  CurrentUser,
  LoginResponse,
  Priority,
  DashboardSummary,
  AgentPerformance,
} from "./api-types";
import { API_BASE_URL } from "./app-config";

type RequestOptions = {
  token?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
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
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiResponse<T>
    | { message?: string; error?: { message?: string } }
    | null;

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
  ) {
    return request<ConversationDetail>(`/conversations/${id}/status`, "PATCH", {
      token,
      body: { status },
    });
  },

  updateConversationPriority(token: string, id: string, priority: Priority) {
    return request<ConversationDetail>(
      `/conversations/${id}/priority`,
      "PATCH",
      {
        token,
        body: { priority },
      },
    );
  },

  assignConversation(token: string, id: string, assignedAgentId: string) {
    return request<ConversationDetail>(
      `/conversations/${id}/assignment`,
      "PATCH",
      {
        token,
        body: { assignedAgentId },
      },
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

  getAgents(token: string) {
    return request<{ id: string; name: string; email: string }[]>("/users/agents", "GET", {
      token,
    });
  },
};
