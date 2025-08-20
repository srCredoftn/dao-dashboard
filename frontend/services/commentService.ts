import type { TaskComment } from "@shared/dao";

const API_BASE_URL = "/api/comments";

class CommentApiService {
  private async request<T>(
    endpoint: string,
    options?: RequestInit,
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;

    // Get token from localStorage
    const token = localStorage.getItem("auth_token");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Add existing headers if they exist
    if (options?.headers) {
      if (options.headers instanceof Headers) {
        options.headers.forEach((value, key) => {
          headers[key] = value;
        });
      } else if (Array.isArray(options.headers)) {
        options.headers.forEach(([key, value]) => {
          headers[key] = value;
        });
      } else {
        Object.assign(headers, options.headers);
      }
    }

    // Add Authorization header if token exists
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `HTTP error! status: ${response.status}`,
        );
      }

      return await response.json();
    } catch (error) {
      console.error(`Comment API request failed for ${endpoint}:`, error);
      throw error;
    }
  }

  // Get all comments for a DAO
  async getDaoComments(daoId: string): Promise<TaskComment[]> {
    return this.request<TaskComment[]>(`/dao/${daoId}`);
  }

  // Get comments for a specific task
  async getTaskComments(daoId: string, taskId: number): Promise<TaskComment[]> {
    return this.request<TaskComment[]>(`/dao/${daoId}/task/${taskId}`);
  }

  // Add a new comment
  async addComment(
    daoId: string,
    taskId: number,
    content: string,
  ): Promise<TaskComment> {
    return this.request<TaskComment>("/", {
      method: "POST",
      body: JSON.stringify({ daoId, taskId, content }),
    });
  }

  // Update a comment
  async updateComment(
    commentId: string,
    content: string,
  ): Promise<TaskComment> {
    return this.request<TaskComment>(`/${commentId}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    });
  }

  // Delete a comment
  async deleteComment(commentId: string): Promise<void> {
    return this.request<void>(`/${commentId}`, {
      method: "DELETE",
    });
  }

  // Get recent comments
  async getRecentComments(limit: number = 10): Promise<TaskComment[]> {
    return this.request<TaskComment[]>(`/recent?limit=${limit}`);
  }
}

export const commentService = new CommentApiService();
