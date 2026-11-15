import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';

test('renders the home page join form', () => {
  render(<App />);
  expect(screen.getByPlaceholderText('ROOM ID')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('USERNAME')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Join' })).toBeInTheDocument();
});

test('creating a new room fills in a room ID', () => {
  render(<App />);
  fireEvent.click(screen.getByText('new room'));
  expect(screen.getByPlaceholderText('ROOM ID').value).toMatch(
    /^[0-9a-f-]{36}$/
  );
});
