// Test file for LSP extract function refactoring
// Task: Extract repeated error handling into handleApiError() function

export class ApiClient {
  async fetchUser(id: string): Promise<unknown> {
    try {
      const response = await fetch(`/api/users/${id}`);
      if (!response.ok) {
        // DUPLICATE ERROR HANDLING PATTERN #1
        console.error(`API Error: ${response.status} ${response.statusText}`);
        throw new Error(`Failed to fetch user: ${response.statusText}`);
      }
      return response.json();
    } catch (error) {
      console.error('Fetch user failed:', error);
      throw error;
    }
  }

  async createUser(data: unknown): Promise<unknown> {
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        // DUPLICATE ERROR HANDLING PATTERN #2 (should be extracted)
        console.error(`API Error: ${response.status} ${response.statusText}`);
        throw new Error(`Failed to create user: ${response.statusText}`);
      }
      return response.json();
    } catch (error) {
      console.error('Create user failed:', error);
      throw error;
    }
  }

  async deleteUser(id: string): Promise<void> {
    try {
      const response = await fetch(`/api/users/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        // DUPLICATE ERROR HANDLING PATTERN #3 (should be extracted)
        console.error(`API Error: ${response.status} ${response.statusText}`);
        throw new Error(`Failed to delete user: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Delete user failed:', error);
      throw error;
    }
  }
}
