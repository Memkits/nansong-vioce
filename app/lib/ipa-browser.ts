/** Best-effort teardown must not hide the original playback error. */
export function closeIpaAudioContext(context: AudioContext | null) {
  if (!context || context.state === 'closed') return;
  try { void context.close().catch(() => { /* Closing may race with teardown. */ }); }
  catch { /* A partially initialized context may reject synchronously. */ }
}

export function releaseIpaPlayback(resources: {
  worker: { current: Worker | null };
  context: { current: AudioContext | null };
  sources: Set<AudioBufferSourceNode>;
}) {
  const worker = resources.worker.current;
  const context = resources.context.current;
  const nodes = [...resources.sources];
  // Detach first: repeated cleanup and queued callbacks cannot reuse resources.
  resources.worker.current = null;
  resources.context.current = null;
  resources.sources.clear();
  try { worker?.terminate(); } catch { /* Continue releasing audio resources. */ }
  for (const node of nodes) {
    node.onended = null;
    // A node registered before connect/start failed may never have started.
    // Ended nodes alone are not an error according to the Web Audio spec.
    try { node.stop(); } catch { /* Do not interrupt the remaining cleanup. */ }
    try { node.disconnect(); } catch { /* It may already be disconnected. */ }
  }
  closeIpaAudioContext(context);
}

/** Include response-body consumption in the timeout, not just fetch headers. */
export async function withIpaDownloadTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs = 90_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('声线下载超时', 'TimeoutError')), timeoutMs);
  try { return await operation(controller.signal); }
  finally { clearTimeout(timer); }
}
