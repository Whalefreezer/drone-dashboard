import { setupServer } from 'msw/node';
import { BASE_URL, handlers } from './handlers.ts';
import axios from 'axios';

// This configures a request mocking server with the given request handlers.
export const server = setupServer(...handlers); 


axios.defaults.baseURL = BASE_URL;

