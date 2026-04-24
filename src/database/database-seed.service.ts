import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Balance } from '../entities/balance.entity';
import { Employee } from '../entities/employee.entity';
import { Location } from '../entities/location.entity';

@Injectable()
export class DatabaseSeedService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(Balance)
    private readonly balanceRepository: Repository<Balance>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seedEmployees();
    await this.seedLocations();
    await this.seedBalances();
  }

  private async seedEmployees(): Promise<void> {
    const employees: Employee[] = [
      { id: 1, externalEmployeeId: 'EMP-1', name: 'Ali' },
      { id: 2, externalEmployeeId: 'EMP-2', name: 'Sara' },
    ];

    for (const employee of employees) {
      const existing = await this.employeeRepository.findOne({ where: { id: employee.id } });
      if (!existing) {
        await this.employeeRepository.save(this.employeeRepository.create(employee));
      }
    }
  }

  private async seedLocations(): Promise<void> {
    const locations: Location[] = [
      { id: 10, externalLocationId: 'LOC-10', name: 'Karachi' },
      { id: 20, externalLocationId: 'LOC-20', name: 'Lahore' },
    ];

    for (const location of locations) {
      const existing = await this.locationRepository.findOne({ where: { id: location.id } });
      if (!existing) {
        await this.locationRepository.save(this.locationRepository.create(location));
      }
    }
  }

  private async seedBalances(): Promise<void> {
    const balances: Array<Partial<Balance>> = [
      {
        employeeId: 1,
        locationId: 10,
        availableDays: 10,
        pendingDays: 0,
        lastSyncedAt: new Date(),
        version: 1,
      },
      {
        employeeId: 2,
        locationId: 10,
        availableDays: 5,
        pendingDays: 0,
        lastSyncedAt: new Date(),
        version: 1,
      },
    ];

    for (const balance of balances) {
      const existing = await this.balanceRepository.findOne({
        where: {
          employeeId: balance.employeeId,
          locationId: balance.locationId,
        },
      });
      if (!existing) {
        await this.balanceRepository.save(this.balanceRepository.create(balance));
      }
    }
  }
}
