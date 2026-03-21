export function usePollingInterval(status) {
  return status === "pending" || status === "processing" ? 3000 : false;
}

