const pendingTopicKey = 'geslaagd.pending-topic';

export function savePendingTopic(topic: string): void {
  const normalizedTopic = topic.trim();
  if (normalizedTopic) {
    window.sessionStorage.setItem(pendingTopicKey, normalizedTopic);
  } else {
    window.sessionStorage.removeItem(pendingTopicKey);
  }
}

export function takePendingTopic(): string {
  const topic = window.sessionStorage.getItem(pendingTopicKey) ?? '';
  window.sessionStorage.removeItem(pendingTopicKey);
  return topic;
}