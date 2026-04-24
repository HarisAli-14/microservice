import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { TimeOffRequestStatus } from '../common/enums';

@Entity()
export class TimeOffRequest {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  employeeId!: number;

  @Column()
  locationId!: number;

  @Column()
  startDate!: string;

  @Column()
  endDate!: string;

  @Column('float')
  daysRequested!: number;

  @Column({ type: 'varchar' })
  status!: TimeOffRequestStatus;

  @Column({ unique: true })
  idempotencyKey!: string;

  @Column({ type: 'varchar', nullable: true })
  hcmReferenceId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  rejectionReason!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
