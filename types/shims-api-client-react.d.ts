declare module '@workspace/api-client-react' {
  export type AuthTokenGetter = any;
  export const setBaseUrl: (url: string | null) => void;
  export const setAuthTokenGetter: (g: AuthTokenGetter | null) => void;

  export const useCreateSession: any;
  export const useUpdateSession: any;
  export const useAnalyzeContext: any;
  export const useTranscribeAudio: any;
  export const useCreateInsight: any;
  export const useGetStats: any;
  export const useListSessions: any;
  export const useGetSession: any;
  export const useListSessionInsights: any;
  export const useDeleteSession: any;

  export const getGetStatsQueryKey: any;
  export const getListSessionsQueryKey: any;
  export const getGetSessionQueryKey: any;
  export const getListSessionInsightsQueryKey: any;

  // Fallback for any other named export
  export const __ANY__: any;
}
