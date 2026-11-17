export type ViewDataState = "initial" | "refreshing" | "empty" | "error" | "ready";

export type ViewDataStateInput = {
  hasData: boolean;
  isLoading: boolean;
  hasError: boolean;
  isEmpty: boolean;
};

export function deriveViewDataState({
  hasData,
  isLoading,
  hasError,
  isEmpty,
}: ViewDataStateInput): ViewDataState {
  if (isLoading) return hasData ? "refreshing" : "initial";
  if (hasError && !hasData) return "error";
  if (hasData && isEmpty) return "empty";
  return "ready";
}
