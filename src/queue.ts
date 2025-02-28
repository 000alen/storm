/**
 * A simple async queue to ensure operations run one at a time
 */
export class AsyncQueue {
  private queue: Array<() => Promise<any>> = [];
  private isProcessing = false;

  /**
   * Add a task to the queue and process it when it's turn comes
   */
  async enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task();
          resolve(result);
          return result;
        } catch (error) {
          reject(error);
          throw error;
        }
      });

      // Start processing if not already doing so
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  /**
   * Process queue items one at a time
   */
  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.queue.length > 0) {
        const task = this.queue.shift();
        if (task) {
          await task();
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
}
