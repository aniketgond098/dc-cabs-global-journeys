export type CustomerDetails = {
  name: string;
  email: string;
  phone: string;
};

export type CustomerDetailsErrors = Partial<Record<keyof CustomerDetails, string>>;

/** Mirror the customer fields accepted by the booking API for early, helpful feedback. */
export function validateCustomerDetails(details: CustomerDetails): CustomerDetailsErrors {
  const errors: CustomerDetailsErrors = {};
  const name = details.name.trim();
  const email = details.email.trim();
  const phone = details.phone.trim();

  if (!name) errors.name = "Enter the passenger’s full name.";
  else if (name.length > 120) errors.name = "Name must be 120 characters or fewer.";

  if (!email) errors.email = "Enter an email address for booking updates.";
  else if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Enter a valid email address.";
  }

  const digits = phone.replace(/\D/g, "");
  if (!phone) errors.phone = "Enter a phone number for booking coordination.";
  else if (phone.length > 32 || !/^[+0-9().\-\s]+$/.test(phone) || digits.length < 7) {
    errors.phone = "Enter a valid phone number with at least 7 digits.";
  }

  return errors;
}
