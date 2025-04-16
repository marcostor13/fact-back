import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  ForbiddenException,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { User, UserDocument, UserResponse } from '../entities/user.entity'
import { CreateUserDto } from '../dto/create-user.dto'
import { UpdateUserDto } from '../dto/update-user.dto'
import * as bcrypt from 'bcrypt'
import { UserRole } from '../../auth/enums/user-role.enum'

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name)

  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async create(createUserDto: CreateUserDto): Promise<UserDocument> {
    try {
      this.logger.log(
        `Intentando crear usuario: ${JSON.stringify(createUserDto)}`
      )

      const existingUser = await this.userModel.findOne({
        email: createUserDto.email,
      })
      if (existingUser) {
        this.logger.warn(`Usuario con email ${createUserDto.email} ya existe`)
        throw new BadRequestException('El email ya está registrado')
      }

      if (createUserDto.role === UserRole.COMPANY && !createUserDto.companyId) {
        this.logger.warn('Se requiere companyId para usuarios de tipo COMPANY')
        throw new BadRequestException(
          'Se requiere companyId para usuarios de tipo COMPANY'
        )
      }

      const hashedPassword = await bcrypt.hash(createUserDto.password, 10)
      const userData = {
        ...createUserDto,
        password: hashedPassword,
        companyId: createUserDto.companyId || null,
      }

      this.logger.debug(
        `Datos del usuario a crear: ${JSON.stringify(userData)}`
      )

      const createdUser = new this.userModel(userData)
      const result = await createdUser.save()

      this.logger.log(`Usuario creado exitosamente con ID: ${result._id}`)
      this.logger.debug(
        `Datos del usuario creado: ${JSON.stringify({
          _id: result._id,
          email: result.email,
          role: result.role,
          companyId: result.companyId,
        })}`
      )

      return result
    } catch (error) {
      this.logger.error(`Error al crear usuario: ${error.message}`, error.stack)
      throw error
    }
  }

  async findAll(companyId?: string): Promise<UserDocument[]> {
    try {
      this.logger.log('Obteniendo todos los usuarios')
      if (companyId) {
        return await this.userModel.find({ companyId }).exec()
      }
      return await this.userModel.find().exec()
    } catch (error) {
      this.logger.error(
        `Error al obtener usuarios: ${error.message}`,
        error.stack
      )
      throw error
    }
  }

  async findOne(id: string, currentUser?: UserDocument): Promise<UserDocument> {
    try {
      this.logger.log(`Buscando usuario con ID: ${id}`)
      const user = await this.userModel.findById(id).exec()
      if (!user) {
        this.logger.warn(`Usuario con ID ${id} no encontrado`)
        throw new NotFoundException(`Usuario con ID ${id} no encontrado`)
      }

      if (
        currentUser?.role === UserRole.COMPANY &&
        user.companyId !== currentUser.companyId
      ) {
        throw new ForbiddenException(
          'You can only view users from your company'
        )
      }

      return user
    } catch (error) {
      this.logger.error(
        `Error al buscar usuario: ${error.message}`,
        error.stack
      )
      throw error
    }
  }

  async findByEmail(email: string): Promise<UserDocument> {
    try {
      this.logger.log(`Buscando usuario con email: ${email}`)
      const user = await this.userModel.findOne({ email }).exec()
      if (!user) {
        this.logger.warn(`Usuario con email ${email} no encontrado`)
        throw new NotFoundException(`Usuario con email ${email} no encontrado`)
      }
      return user
    } catch (error) {
      this.logger.error(
        `Error al buscar usuario por email: ${error.message}`,
        error.stack
      )
      throw error
    }
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    currentUser?: UserDocument
  ): Promise<UserDocument> {
    try {
      this.logger.log(`Actualizando usuario con ID: ${id}`)
      const user = await this.findOne(id, currentUser)

      if (
        currentUser?.role === UserRole.COMPANY &&
        user.companyId !== currentUser.companyId
      ) {
        throw new ForbiddenException(
          'You can only update users from your company'
        )
      }

      if (
        currentUser?.role === UserRole.COMPANY &&
        updateUserDto.role === UserRole.ADMIN
      ) {
        throw new ForbiddenException('You cannot assign the ADMIN role')
      }

      if (updateUserDto.role === UserRole.COMPANY && !updateUserDto.companyId) {
        this.logger.warn('Se requiere companyId para usuarios de tipo COMPANY')
        throw new BadRequestException(
          'Se requiere companyId para usuarios de tipo COMPANY'
        )
      }

      if (updateUserDto.password) {
        updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10)
      }

      const updatedUser = await this.userModel
        .findByIdAndUpdate(id, { $set: updateUserDto }, { new: true })
        .exec()

      this.logger.log(`Usuario actualizado exitosamente: ${id}`)
      this.logger.debug(
        `Datos del usuario actualizado: ${JSON.stringify({
          _id: updatedUser._id,
          email: updatedUser.email,
          role: updatedUser.role,
          companyId: updatedUser.companyId,
        })}`
      )

      return updatedUser
    } catch (error) {
      this.logger.error(
        `Error al actualizar usuario: ${error.message}`,
        error.stack
      )
      throw error
    }
  }

  async remove(id: string, currentUser?: UserDocument): Promise<void> {
    try {
      this.logger.log(`Eliminando usuario con ID: ${id}`)
      const user = await this.findOne(id, currentUser)

      if (
        currentUser?.role === UserRole.COMPANY &&
        user.companyId !== currentUser.companyId
      ) {
        throw new ForbiddenException(
          'You can only delete users from your company'
        )
      }

      const result = await this.userModel.findByIdAndDelete(id).exec()
      if (!result) {
        this.logger.warn(`Usuario con ID ${id} no encontrado`)
        throw new NotFoundException(`Usuario con ID ${id} no encontrado`)
      }
      this.logger.log(`Usuario eliminado exitosamente: ${id}`)
    } catch (error) {
      this.logger.error(
        `Error al eliminar usuario: ${error.message}`,
        error.stack
      )
      throw error
    }
  }
}
