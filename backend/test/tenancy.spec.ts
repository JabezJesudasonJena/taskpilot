import { describe, it, expect } from 'vitest';
import { APP_GUARD } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { AppModule } from '../src/app.module.js';
import { JwtAuthGuard } from '../src/common/index.js';
import {
  WorkspaceAccessGuard,
  WORKSPACE_ROLES_KEY,
} from '../src/modules/workspaces/index.js';

const PATH_METADATA = 'path';
const METHOD_METADATA = 'method';

function getAllControllers(module: any, visited = new Set<any>()): any[] {
  if (!module || visited.has(module)) return [];
  visited.add(module);
  const controllers = Reflect.getMetadata('controllers', module) || [];
  const imports = Reflect.getMetadata('imports', module) || [];
  const nestedControllers = imports.flatMap((imp: any) =>
    getAllControllers(imp?.module || imp, visited),
  );
  return [...controllers, ...nestedControllers];
}

describe('Tenancy & Guard Ordering Rules', () => {
  it('registers JwtAuthGuard before WorkspaceAccessGuard in AppModule', () => {
    // Reflect metadata on AppModule to verify guard declaration order
    const providers = Reflect.getMetadata('providers', AppModule) || [];

    const guards = providers
      .filter((p: any) => p && typeof p === 'object' && p.provide === APP_GUARD)
      .map((p: any) => p.useClass);

    expect(guards.length).toBeGreaterThanOrEqual(2);
    const jwtIndex = guards.indexOf(JwtAuthGuard);
    const workspaceIndex = guards.indexOf(WorkspaceAccessGuard);

    expect(jwtIndex).toBeGreaterThanOrEqual(0);
    expect(workspaceIndex).toBeGreaterThanOrEqual(0);
    expect(jwtIndex).toBeLessThan(workspaceIndex);
  });

  it('verifies that every non-GET workspace-scoped route explicitly declares @WorkspaceRoles', () => {
    const controllers = getAllControllers(AppModule);
    expect(controllers.length).toBeGreaterThan(0);

    const violations: string[] = [];

    for (const controller of controllers) {
      const controllerPath =
        Reflect.getMetadata(PATH_METADATA, controller) || '';
      const proto = controller.prototype;
      const propNames = Object.getOwnPropertyNames(proto);

      for (const prop of propNames) {
        const handler = proto[prop];
        if (typeof handler !== 'function') continue;

        const methodPath = Reflect.getMetadata(PATH_METADATA, handler);
        const requestMethod = Reflect.getMetadata(METHOD_METADATA, handler);

        if (methodPath !== undefined && requestMethod !== undefined) {
          const fullPath = `/${controllerPath}/${methodPath}`.replace(
            /\/+/g,
            '/',
          );

          if (fullPath.includes(':workspaceId')) {
            const isGet = requestMethod === RequestMethod.GET;
            const role = Reflect.getMetadata(WORKSPACE_ROLES_KEY, handler);

            if (!isGet) {
              if (!role) {
                violations.push(
                  `Non-GET tenant route ${fullPath} [${RequestMethod[requestMethod]}] on ${controller.name}.${prop} is missing @WorkspaceRoles`,
                );
              } else if (role === WorkspaceRole.GUEST) {
                // GUEST is only allowed for member self-leaving
                const isMemberSelfLeave =
                  fullPath.endsWith('/members/:userId') &&
                  requestMethod === RequestMethod.DELETE;
                if (!isMemberSelfLeave) {
                  violations.push(
                    `Non-GET tenant route ${fullPath} [${RequestMethod[requestMethod]}] on ${controller.name}.${prop} explicitly declared GUEST, which is only permitted for self-leaving`,
                  );
                }
              }
            }
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
