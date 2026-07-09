import mongoose from 'mongoose';

const QuestionSchema = new mongoose.Schema({
  prompt: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    required: true,
    enum: ['short_text', 'multiple_choice', 'likert', 'true_false']
  },
  options: [{
    type: String,
    trim: true
  }]
}, { _id: false });

const ExitTicketSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  status: {
    type: String,
    required: true,
    enum: ['draft', 'active', 'ended', 'archived'],
    default: 'draft'
  },
  joinCode: {
    type: String,
    unique: true,
    sparse: true,
    uppercase: true,
    trim: true
  },
  questions: [QuestionSchema],
  responsesCount: {
    type: Number,
    default: 0
  },
  createdBy: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for faster queries
ExitTicketSchema.index({ status: 1, createdBy: 1 });
ExitTicketSchema.index({ joinCode: 1 });

export default mongoose.models.ExitTicket || mongoose.model('ExitTicket', ExitTicketSchema);
