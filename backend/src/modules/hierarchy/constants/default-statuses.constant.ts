import { StatusType } from '@prisma/client';

export interface DefaultStatusDefinition {
  name: string;
  type: StatusType;
  position: number;
  color?: string;
}

export const DEFAULT_STATUSES: readonly DefaultStatusDefinition[] = [
  {
    name: 'To Do',
    type: StatusType.OPEN,
    position: 0,
    color: '#6B7280',
  },
  {
    name: 'In Progress',
    type: StatusType.ACTIVE,
    position: 1,
    color: '#3B82F6',
  },
  {
    name: 'Done',
    type: StatusType.DONE,
    position: 2,
    color: '#10B981',
  },
] as const;
