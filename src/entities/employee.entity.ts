import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity()
export class Employee {
  @PrimaryColumn()
  id!: number;

  @Column({ unique: true })
  externalEmployeeId!: string;

  @Column()
  name!: string;
}
