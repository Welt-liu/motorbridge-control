import { access } from 'node:fs/promises';
import path from 'node:path';
import { staticHandler } from '../static.js';

export const studioPlugin = {
  name: 'motorbridge-studio', inject: ['http'],
  async apply(ctx, config) {
    await access(path.join(config.dist, 'index.html'));
    ctx.effect(() => {
      ctx.http.mounts.set('/studio', staticHandler(config.dist, '/studio'));
      return () => ctx.http.mounts.delete('/studio');
    });
    ctx.provide('studio', { id: 'motorbridge-studio', version: '1.1.9', sourceCommit: '23b6e62ab8173faee3928c827cca3b7f42ba2128' });
  },
};
