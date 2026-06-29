using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using EMS.Data.Data;
using EMS.Data.Models;
using EMS.Shared.DTOs;

namespace EMS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class UsersController : ControllerBase
{
    private readonly EmsDbContext _context;

    public UsersController(EmsDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<UserDto>>> GetUsers()
    {
        var users = await _context.Users.ToListAsync();
        return Ok(users.Select(MapToDto));
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<UserDto>> GetUser(int id)
    {
        var user = await _context.Users.FindAsync(id);
        return user == null ? NotFound() : Ok(MapToDto(user));
    }

    [HttpPost]
    public async Task<ActionResult<UserDto>> CreateUser(UserDto dto)
    {
        var user = MapToEntity(dto);
        _context.Users.Add(user);
        await _context.SaveChangesAsync();
        dto.UserID = user.UserID;
        return CreatedAtAction(nameof(GetUser), new { id = user.UserID }, dto);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateUser(int id, UserDto dto)
    {
        if (id != dto.UserID) return BadRequest();
        var user = await _context.Users.FindAsync(id);
        if (user == null) return NotFound();
        
        UpdateEntity(user, dto);
        await _context.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteUser(int id)
    {
        var user = await _context.Users.FindAsync(id);
        if (user == null) return NotFound();
        _context.Users.Remove(user);
        await _context.SaveChangesAsync();
        return NoContent();
    }

    private static UserDto MapToDto(User u) => new()
    {
        UserID = u.UserID,
        FullName = u.FullName,
        Designation = u.Designation,
        MailId = u.MailId,
        LoginPassword = u.LoginPassword,
        Status = u.Status,
        Department = u.Department,
        Roles = u.Roles
    };

    private static User MapToEntity(UserDto dto) => new()
    {
        FullName = dto.FullName,
        Designation = dto.Designation,
        MailId = dto.MailId,
        LoginPassword = dto.LoginPassword,
        Status = dto.Status,
        Department = dto.Department,
        Roles = dto.Roles
    };

    private static void UpdateEntity(User entity, UserDto dto)
    {
        entity.FullName = dto.FullName;
        entity.Designation = dto.Designation;
        entity.MailId = dto.MailId;
        entity.LoginPassword = dto.LoginPassword;
        entity.Status = dto.Status;
        entity.Department = dto.Department;
        entity.Roles = dto.Roles;
    }
}
