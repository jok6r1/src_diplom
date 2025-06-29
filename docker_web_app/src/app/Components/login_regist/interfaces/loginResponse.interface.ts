export interface LoginResponse {
    accessToken: string;
    refreshToken: string;
    user: {
      id: number;
      username: string;
      email: string;
    };
  }