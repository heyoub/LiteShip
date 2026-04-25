import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../packages/mcp-server/src/stdio.js', () => ({
  runStdio: vi.fn(async () => undefined),
}));

vi.mock('../../../packages/mcp-server/src/http.js', () => ({
  runHttp: vi.fn(async (_bind: string) => undefined),
}));

import { start } from '../../../packages/mcp-server/src/start.js';
import * as stdioModule from '../../../packages/mcp-server/src/stdio.js';
import * as httpModule from '../../../packages/mcp-server/src/http.js';

const runStdioMock = vi.mocked(stdioModule.runStdio);
const runHttpMock = vi.mocked(httpModule.runHttp);

describe('MCP start dispatch', () => {
  beforeEach(() => {
    runStdioMock.mockClear();
    runHttpMock.mockClear();
  });

  it('dispatches to runStdio when no http option is provided', async () => {
    await start();
    expect(runStdioMock).toHaveBeenCalledTimes(1);
    expect(runHttpMock).not.toHaveBeenCalled();
  });

  it('dispatches to runHttp with the bind string when http option is provided', async () => {
    await start({ http: ':3838' });
    expect(runHttpMock).toHaveBeenCalledTimes(1);
    expect(runHttpMock).toHaveBeenCalledWith(':3838');
    expect(runStdioMock).not.toHaveBeenCalled();
  });
});
