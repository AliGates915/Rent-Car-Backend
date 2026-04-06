// backend/controllers/setupController.js
import  SetupModel from '../../models/SetupModel.js';

// Generic CRUD operations for any setup type
const createSetupItem = (modelName) => async (req, res) => {
  try {
    const data = { ...req.body, module_type: modelName };
    const item = await SetupModel.create(modelName, data);
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

const getSetupItems = (modelName) => async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', status = '' } = req.query;
    const items = await SetupModel.findAll(modelName, { page, limit, search, status });
    res.status(200).json({ success: true, data: items });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

const getSetupItemById = (modelName) => async (req, res) => {
  try {
    const item = await SetupModel.findById(modelName, req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    res.status(200).json({ success: true, data: item });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

const updateSetupItem = (modelName) => async (req, res) => {
  try {
    const item = await SetupModel.updateById(modelName, req.params.id, req.body);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    res.status(200).json({ success: true, data: item });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

const deleteSetupItem = (modelName) => async (req, res) => {
  try {
    const item = await SetupModel.deleteById(modelName, req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    res.status(200).json({ success: true, message: 'Item deleted successfully' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export {
  createSetupItem,
  getSetupItems,
  getSetupItemById,
  updateSetupItem,
  deleteSetupItem
};