import CustomerDetails from "../models/CustomerDetails.js";

// Create new customer details
export const createCustomerDetails = async (req, res, next) => {
  try {
    // Get the last ownerCode and increment it
    const lastCustomer = await CustomerDetails.findOne().sort({ ownerCode: -1 });
    const nextOwnerCode = lastCustomer ? lastCustomer.ownerCode + 1 : 1;

    // Create a new instance of CustomerDetails
    const newCustomer = new CustomerDetails({
      ...req.body,
      ownerCode: nextOwnerCode, // Automatically assign the next ownerCode
    });

    // Save to database
    const savedCustomer = await newCustomer.save();
    res.status(201).json(savedCustomer);
  } catch (error) {
    console.error("Error creating customer details:", error);
    res.status(500).json({ message: "Failed to create customer details", error: error.message });
  }
};
// Update
export const updateCustomerDetails = async (req, res, next) => {
    try {
      const updatedCustomer = await CustomerDetails.findByIdAndUpdate(
        req.params.id,
        { $set: req.body },
        { new: true }
      );
  
      if (!updatedCustomer) {
        return res.status(404).json({ message: "Customer not found" });
      }
  
      res.status(200).json(updatedCustomer);
    } catch (error) {
      console.error("Error updating customer details:", error);
      res.status(500).json({ message: "Failed to update customer details", error: error.message });
    }
  };

//   Delete data through ID
export const deleteCustomerDetails = async (req, res, next) => {
    try {
      const deletedCustomer = await CustomerDetails.findByIdAndDelete(req.params.id);
      if (!deletedCustomer) {
        return res.status(404).json({ message: "Customer not found" });
      }
      res.status(200).json({ message: "Customer deleted successfully", deletedCustomer });
    } catch (error) {
      console.error("Error deleting customer details:", error);
      res.status(500).json({ message: "Failed to delete customer details", error: error.message });
    }
  };
  
  
// DET All
export const getAllCustomerDetails = async (req, res, next) => {
    try {
      const customers = await CustomerDetails.find();
      res.status(200).json(customers);
    } catch (error) {
      console.error("Error fetching customer details:", error);
      res.status(500).json({ message: "Failed to fetch customer details", error: error.message });
    }
  };
// Get by ID
  export const getCustomerDetailsById = async (req, res, next) => {
    try {
      const customer = await CustomerDetails.findById(req.params.id);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }
      res.status(200).json(customer);
    } catch (error) {
      console.error("Error fetching customer details:", error);
      res.status(500).json({ message: "Failed to fetch customer details", error: error.message });
    }
  };
  
