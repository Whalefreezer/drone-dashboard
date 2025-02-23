// @deno-types="@types/react"
import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('React error caught:', error, errorInfo);
  }

  override componentDidUpdate(prevProps: Props, prevState: State) {
    if (!prevState.hasError && this.state.hasError) {
      console.log('Scheduling page reload in 10 seconds...');
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    }
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '20px',
          textAlign: 'center',
          backgroundColor: '#2a0000',
          borderRadius: '8px',
          margin: '20px'
        }}>
          <h2>Something went wrong</h2>
          <p>The page will reload in 3 seconds...</p>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary; 