import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { BalanceSyncEventType } from '../common/enums';

@Entity()
export class BalanceSyncEvent {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  employeeId!: number;

  @Column()
  locationId!: number;

  @Column({ type: 'varchar' })
  eventType!: BalanceSyncEventType;

  @Column({ type: 'text' })
  payload!: string;

  @Column({ type: 'text' })
  result!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
