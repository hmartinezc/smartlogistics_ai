// Mock function to simulate "Reserva" data for comparison
// Replace this import with a real API service when connecting to actual booking systems
export const getMockReserva = (mawb: string, actualPieces: number, actualFulls: number, actualHijas: number) => {
   // Simulate a slight discrepancy for demo purposes
   const isDiscrepancy = mawb.endsWith('5') || mawb.endsWith('9');
   return {
      bookedHijas: isDiscrepancy ? actualHijas + 1 : actualHijas,
      bookedPieces: isDiscrepancy ? actualPieces + 10 : actualPieces,
      bookedFulls: isDiscrepancy ? actualFulls + 0.5 : actualFulls
   };
};
