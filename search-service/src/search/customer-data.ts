import type { CustomerRecord } from './search.types';

const firstNames = [
  'Aarav',
  'Aditi',
  'Akash',
  'Ananya',
  'Arjun',
  'Diya',
  'Ishaan',
  'Kavya',
  'Meera',
  'Rahul',
  'Rohan',
  'Saanvi',
  'Vikram',
  'Priya',
  'Neha',
  'Karthik',
  'Sneha',
  'Aditya',
  'Pooja',
  'Varun',
];

const lastNames = [
  'Sharma',
  'Patel',
  'Reddy',
  'Iyer',
  'Nair',
  'Gupta',
  'Kumar',
  'Singh',
  'Mehta',
  'Rao',
  'Joshi',
  'Das',
  'Verma',
  'Menon',
  'Pillai',
  'Desai',
  'Kapoor',
  'Chopra',
  'Mishra',
  'Kulkarni',
];

const cities = [
  'Mumbai',
  'Delhi',
  'Bengaluru',
  'Hyderabad',
  'Ahmedabad',
  'Chennai',
  'Kolkata',
  'Pune',
  'Jaipur',
  'Lucknow',
  'Kochi',
  'Bhopal',
  'Patna',
  'Indore',
  'Surat',
  'Nagpur',
  'Coimbatore',
  'Visakhapatnam',
  'Thiruvananthapuram',
  'Chandigarh',
];

const states = [
  'Maharashtra',
  'Delhi',
  'Karnataka',
  'Telangana',
  'Gujarat',
  'Tamil Nadu',
  'West Bengal',
  'Rajasthan',
  'Uttar Pradesh',
  'Kerala',
  'Madhya Pradesh',
  'Bihar',
  'Punjab',
  'Odisha',
  'Assam',
  'Jharkhand',
  'Haryana',
  'Goa',
  'Chhattisgarh',
  'Uttarakhand',
];

export function createCustomerRecord(index: number): CustomerRecord {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError('Customer index must be a non-negative integer');
  }

  return {
    id: `customer-${String(index + 1).padStart(5, '0')}`,
    name: `${firstNames[index % firstNames.length]} ${lastNames[
      Math.floor(index / firstNames.length) % lastNames.length
    ]}`,
    mobile: String(6000000000 + index),
    city: cities[index % cities.length],
    state: states[index % states.length],
    status: index % 2 === 0 ? 'ACTIVE' : 'INACTIVE',
  };
}
