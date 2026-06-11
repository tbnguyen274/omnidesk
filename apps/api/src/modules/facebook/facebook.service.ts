import { Injectable } from '@nestjs/common';
import { FacebookRepository } from './facebook.repository';

@Injectable()
export class FacebookService {
  constructor(private readonly facebookRepository: FacebookRepository) {}
}
