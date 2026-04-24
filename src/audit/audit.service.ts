import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../entities/audit-log.entity';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
  ) {}

  async log(entityType: string, entityId: string | number, action: string, details: Record<string, unknown>): Promise<AuditLog> {
    return this.auditRepository.save(
      this.auditRepository.create({
        entityType,
        entityId: String(entityId),
        action,
        details: JSON.stringify(details),
      }),
    );
  }

  async findAll(): Promise<AuditLog[]> {
    return this.auditRepository.find({ order: { id: 'ASC' } });
  }
}
