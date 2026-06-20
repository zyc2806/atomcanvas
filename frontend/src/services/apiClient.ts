import axios from 'axios';

// 60s upper bound: long enough for slow geometry/selection requests over a
// laggy SSH tunnel, short enough that a wedged backend surfaces as an error
// instead of a permanently spinning UI. File-upload calls override per-request
// via { timeout: 0 } when they really do need unbounded waits.
const DEFAULT_TIMEOUT_MS = 60_000;

const apiClient = axios.create({
    baseURL: '/api',
    timeout: DEFAULT_TIMEOUT_MS,
    headers: {
        'Content-Type': 'application/json',
    },
});

export default apiClient;
