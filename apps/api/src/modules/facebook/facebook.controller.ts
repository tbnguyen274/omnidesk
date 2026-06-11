import { Controller } from '@nestjs/common';
import { FacebookService } from './facebook.service';

@Controller('webhooks/facebook')
export class FacebookController {
  constructor(private readonly facebookService: FacebookService) {}
}

@Controller('dev/facebook')
export class DevFacebookController {
  constructor(private readonly facebookService: FacebookService) {}
}
