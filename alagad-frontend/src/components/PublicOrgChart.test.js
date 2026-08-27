import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PublicOrgChart from './PublicOrgChart';

describe('PublicOrgChart', () => {
  const office = { _id: 'office-1', name: 'IT Office', department: 'Information Technology', isActive: true };
  const personnel = [{
    _id: 'person-1',
    name: 'Ada Lovelace',
    title: 'Director',
    office,
    contactInfo: 'ada@example.edu',
    supervisorId: null,
    isActive: true,
  }];

  test('shows only the requested public personnel details after selecting a unit', () => {
    render(<PublicOrgChart offices={[office]} personnel={personnel} onClose={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /IT Office Office/i }));

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Position')).toBeInTheDocument();
    expect(screen.getByText('Office/Department')).toBeInTheDocument();
    expect(screen.getByText('Contact Information')).toBeInTheDocument();
    expect(screen.getByText('ada@example.edu')).toBeInTheDocument();
    expect(screen.queryByText(/reports to/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/supervisor/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit|delete/i })).not.toBeInTheDocument();
  });

  test('filters available offices and departments', () => {
    render(<PublicOrgChart offices={[office]} personnel={personnel} onClose={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('Search office or department'), { target: { value: 'Information' } });

    expect(screen.getByRole('button', { name: /Information Technology Department/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /IT Office Office/i })).not.toBeInTheDocument();
  });
});
