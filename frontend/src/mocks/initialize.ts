        );

        await worker.start({
            onUnhandledRequest: 'bypass',
            quiet: true // Add this option
        });
        worker.resetHandlers(...handlers); 