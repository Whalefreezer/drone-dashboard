export async function robustFetch(url: string): Promise<Response> {
    const timeout = 10_000; // 1 second timeout
    const maxRetries = 10;
    let retries = 0;

    while (retries < maxRetries) {
        try {
            const controller = new AbortController();

            // Create a race between the fetch and the timeout
            const response = await Promise.race([
                fetch(url, { signal: controller.signal }),
                new Promise<never>((_, reject) => {
                    setTimeout(() => {
                        controller.abort();
                        reject(new Error('Request timed out'));
                    }, timeout);
                }),
            ]);

            return response;
        } catch (err) {
            retries++;
            if (retries === maxRetries) {
                throw new Error(`Failed to fetch after ${maxRetries} retries: ${err}`);
            }
            // Exponential backoff
            await new Promise((resolve) => setTimeout(resolve, Math.pow(2, retries) * 100));
        }
    }
    throw new Error('should not get here');
} 