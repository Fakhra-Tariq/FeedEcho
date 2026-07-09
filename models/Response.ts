import mongoose from 'mongoose';

const ResponseSchema = new mongoose.Schema({
  ticketId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExitTicket',
    required: true
  },
  answers: [{
    questionIndex: {
      type: Number,
      required: true
    },
    answer: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    }
  }],
  studentName: {
    type: String,
    required: true,
    trim: true
  },
  submittedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for faster queries
ResponseSchema.index({ ticketId: 1 });

export default mongoose.models.Response || mongoose.model('Response', ResponseSchema);
