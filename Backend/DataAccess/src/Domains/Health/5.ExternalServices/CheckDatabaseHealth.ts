import { AppError, ErrorCode } from '@expense-tracker/core';
import { sql } from 'drizzle-orm';
import type { Database } from '../../../Shared/Database/Database';

export async function checkDatabaseHealth(db: Database): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch (error) {
    throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, `Database health check failed: ${String(error)}`);
  }
}
