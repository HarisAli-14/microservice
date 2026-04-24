import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity()
@Index(['employeeId', 'locationId'], { unique: true })
export class Balance {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  employeeId!: number;

  @Column()
  locationId!: number;

  @Column('float')
  availableDays!: number;

  @Column('float', { default: 0 })
  pendingDays!: number;

  @Column({ type: 'datetime', nullable: true })
  lastSyncedAt!: Date | null;

  @Column({ default: 0 })
  version!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
