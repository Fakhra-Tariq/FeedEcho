import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import ExitTicket from '@/models/ExitTicket';
import { generateJoinCode } from '@/lib/utils';

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const userId = searchParams.get('userId');

    let query: any = {};
    if (status) {
      query.status = status;
    }
    if (userId) {
      query.createdBy = userId;
    }

    const exitTickets = await ExitTicket.find(query)
      .sort({ createdAt: -1 })
      .lean();

    // Get counts for dashboard
    const counts = await ExitTicket.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const countMap = {
      draft: 0,
      active: 0,
      ended: 0,
      archived: 0
    };

    counts.forEach(item => {
      countMap[item._id as keyof typeof countMap] = item.count;
    });

    return NextResponse.json({
      success: true,
      data: exitTickets,
      counts: countMap
    });
  } catch (error) {
    console.error('Error fetching exit tickets:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch exit tickets' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();
    const body = await request.json();
    const { title, questions, userId } = body;

    // Validation
    if (!title?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Title is required' },
        { status: 400 }
      );
    }

    if (!questions || questions.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one question is required' },
        { status: 400 }
      );
    }

    // Validate questions
    for (const question of questions) {
      if (!question.prompt?.trim()) {
        return NextResponse.json(
          { success: false, error: 'All questions must have a prompt' },
          { status: 400 }
        );
      }
      if (!question.type) {
        return NextResponse.json(
          { success: false, error: 'All questions must have a type' },
          { status: 400 }
        );
      }
      if (question.type === 'multiple_choice' && (!question.options || question.options.length < 2)) {
        return NextResponse.json(
          { success: false, error: 'Multiple choice questions must have at least 2 options' },
          { status: 400 }
        );
      }
    }

    // Check if another ticket is already active
    const activeTicket = await ExitTicket.findOne({ 
      status: 'active',
      createdBy: userId 
    });

    const exitTicket = new ExitTicket({
      title: title.trim(),
      status: 'draft',
      questions: questions,
      createdBy: userId,
      responsesCount: 0
    });

    await exitTicket.save();

    return NextResponse.json({
      success: true,
      data: exitTicket
    });
  } catch (error) {
    console.error('Error creating exit ticket:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create exit ticket' },
      { status: 500 }
    );
  }
}
