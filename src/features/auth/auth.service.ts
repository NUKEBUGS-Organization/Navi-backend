import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User } from './user.entity';
import { Model } from 'mongoose';
import {
  ChangePasswordDto,
  CreateUserDto,
  LoginDto,
  ResetPasswordDto,
  SignupDto,
  UpdateUserDto,
} from './dto/auth.dto';
import { hashPassword, comparePassword } from '../../utils/HashPassword';

const normalizeEmail = (email: string): string =>
  email?.trim().toLowerCase();

@Injectable()
export class AuthService {
  constructor(
    @InjectModel('User') private readonly userModel: Model<User>,
  ) {}

  async findAll(): Promise<User[]> {
    try {
      return await this.userModel.find();
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to fetch users. Please try again later.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findOne(id: string): Promise<User | null> {
    try {
      return await this.userModel.findById(id);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to fetch user. Please try again later.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async create(user: CreateUserDto): Promise<User> {
    try {
      if (user.password) {
        user.password = await hashPassword(user.password);
      }
      const createdUser = new this.userModel(user);
      return await createdUser.save();
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to create user. Please try again later.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async Signup(user: SignupDto): Promise<User> {
    try {
      const email = normalizeEmail(user.email);
      const existingUser = await this.userModel.findOne({ email });
      if (existingUser) {
        throw new HttpException(
          'Email already in use. Please use a different email.',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (user.password) {
        user.password = await hashPassword(user.password);
      }
      const createdUser = new this.userModel({
        ...user,
        email,
      });
      return await createdUser.save();
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to sign up user. Please try again later.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async Login(loginDto: LoginDto): Promise<User | null> {
    try {
      const email = normalizeEmail(loginDto.email);
      const user = await this.userModel.findOne({ email });
      if (!user) {
        throw new HttpException(
          'User not found with the provided email.',
          HttpStatus.NOT_FOUND,
        );
      }
      const isValid = await comparePassword(loginDto.password, user.password);
      if (!isValid) {
        throw new HttpException(
          'Invalid email or password.',
          HttpStatus.UNAUTHORIZED,
        );
      }
      return user;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to login. Please try again later.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async ResetPassword(
    resetPasswordDto: ResetPasswordDto,
  ): Promise<User | null> {
    try {
      const email = normalizeEmail(resetPasswordDto.email);
      const user = await this.userModel.findOne({ email });
      if (!user) {
        throw new HttpException(
          'User not found with the provided email.',
          HttpStatus.NOT_FOUND,
        );
      }
      user.password = await hashPassword(resetPasswordDto.newPassword);
      return await user.save();
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to reset password. Please try again later.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async ChangePassword(
    changePasswordDto: ChangePasswordDto,
  ): Promise<User | null> {
    try {
      const email = normalizeEmail(changePasswordDto.email);
      const user = await this.userModel.findOne({ email });
      if (!user) {
        throw new HttpException(
          'User not found with the provided email.',
          HttpStatus.NOT_FOUND,
        );
      }
      const isValid = await comparePassword(
        changePasswordDto.oldPassword,
        user.password,
      );
      if (!isValid) {
        throw new HttpException(
          'Old password is incorrect.',
          HttpStatus.UNAUTHORIZED,
        );
      }
      user.password = await hashPassword(changePasswordDto.newPassword);
      return await user.save();
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to change password. Please try again later.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async update(id: string, user: UpdateUserDto): Promise<User | null> {
    try {
      return await this.userModel.findByIdAndUpdate(id, user, { new: true });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to update user. Please try again later.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async delete(id: string): Promise<string> {
    try {
      await this.userModel.findByIdAndDelete(id);
      return 'user delted successfully';
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to delete user. Please try again later.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
