import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class AuditLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  entityType!: string;

  @Column()
  entityId!: string;

  @Column()
  action!: string;

  @Column({ type: 'text' })
  details!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
