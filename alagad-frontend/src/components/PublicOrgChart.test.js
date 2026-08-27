import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PublicOrgChart from './PublicOrgChart';

describe('PublicOrgChart', () => {
  const office = {
    _id: 'office-1',
    name: 'IT Office',
    isActive: true,
    organizationalChart: {
      data: 'data:image/png;base64,Y2hhcnQ=',
      fileName: 'it-chart.png',
      mimeType: 'image/png',
      updatedAt: '2026-08-27T00:00:00.000Z',
    },
  };
  const department = { _id: 'dept-1', name: 'Information Technology', active: true };

  test('shows the uploaded chart and basic unit information', () => {
    render(<PublicOrgChart offices={[office]} departments={[department]} onClose={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /IT Office Office/i }));

    expect(screen.getByRole('img', { name: 'IT Office organizational chart' })).toHaveAttribute('src', office.organizationalChart.data);
    expect(screen.getByText('Last Updated: August 27, 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument();
    expect(screen.queryByText(/personnel|reports to|supervisor/i)).not.toBeInTheDocument();
  });

  test('shows an empty state when a unit has no uploaded chart', () => {
    render(<PublicOrgChart offices={[office]} departments={[department]} onClose={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Information Technology Department/i }));

    expect(screen.getByText('No organizational chart available')).toBeInTheDocument();
  });

  test('filters offices and departments', () => {
    render(<PublicOrgChart offices={[office]} departments={[department]} onClose={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('Search office or department'), { target: { value: 'Information' } });

    expect(screen.getByRole('button', { name: /Information Technology Department/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /IT Office Office/i })).not.toBeInTheDocument();
  });
});
